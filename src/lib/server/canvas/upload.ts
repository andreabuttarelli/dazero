import { randomUUID } from 'node:crypto';
import type { Db } from '$lib/server/db/client';
import { createNode } from '$lib/server/repos/canvas';
import { deleteAsset, insertAsset, type AssetType } from '$lib/server/repos/assets';
import { removeAssetFile } from '$lib/server/repos/asset-storage';
import { verdictForUpload, canvasUploadPrefix, type UploadKind } from '$lib/canvas/upload-kind';
import { convertFileToMarkdown } from '$lib/server/file-to-markdown';

/**
 * L'UPLOAD ARRIVA GIÀ NELLO STORAGE: questa funzione non riceve più un `File`.
 *
 * Un video sta facilmente sopra i pochi MB che il corpo di un'azione SvelteKit regge su Vercel
 * (~4.5MB, `FUNCTION_PAYLOAD_TOO_LARGE` altrimenti) — lo stesso limite che `studio-actions.ts` e
 * `chat-attachments.ts` hanno già pagato. Il client carica il file DIRETTAMENTE nel bucket
 * `canvas-assets` (la RLS in `20260922_canvas_asset_buckets.sql` lo autorizza per la sua org:
 * `insert` con `(storage.foldername(name))[1] in auth_org_ids()`), e qui arriva solo il percorso
 * — mai i byte. Un'immagine potrebbe ancora passare dentro il corpo, ma usare la stessa strada per
 * tutti e tre i tipi è una scrittura sola invece di due che divergono al primo campo.
 */
export class UploadError extends Error {
  constructor(public readonly status: 400 | 413, message: string) {
    super(message);
  }
}

const NODE_TYPE_FOR_KIND: Record<UploadKind, string> = {
  image: 'image',
  video: 'video',
  document: 'doc'
};

const ASSET_TYPE_FOR_KIND: Record<UploadKind, AssetType> = {
  image: 'image',
  video: 'video',
  document: 'document'
};

async function docContentFor(input: {
  kind: UploadKind;
  buf: ArrayBuffer;
  mimeType: string;
  fileName: string;
}): Promise<string | null> {
  if (input.kind !== 'document') {
    return null;
  }

  try {
    const converted = await convertFileToMarkdown(input.buf, input.mimeType, input.fileName);
    return converted.markdown;
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause);
    throw new UploadError(400, `Non leggibile: ${why}`);
  }
}

/**
 * REGISTRA UN FILE GIÀ CARICATO: un asset in libreria, e un nodo sulla tela nato pieno.
 *
 * Il percorso è verificato — deve stare sotto `CANVAS_UPLOAD_PREFIX(orgId, projectId)`, o un
 * percorso forgiato potrebbe registrare il file di un'altra org come proprio. Il file resta nello
 * Storage anche se questa funzione fallisce PRIMA di scrivere l'asset: a differenza del vecchio
 * `uploadCanvasAsset`, qui il client l'ha già caricato per conto suo, e toglierlo su un errore che
 * magari è solo "il documento non si converte" butterebbe via un file che l'utente rivedrebbe
 * ricaricando la pagina — mostrare l'errore sul nodo (o niente nodo, per un fallimento prima della
 * riga) è la scelta onesta: il file resta raggiungibile dallo Storage per un nuovo tentativo.
 */
export async function registerCanvasUpload(db: Db, input: {
  orgId: string;
  projectId: string;
  canvasId: string;
  path: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  x: number;
  y: number;
}) {
  if (!input.path.startsWith(canvasUploadPrefix(input.orgId, input.projectId)) || input.path.includes('..')) {
    throw new UploadError(400, 'Percorso non valido');
  }

  const verdict = verdictForUpload(input.mimeType, input.fileName, input.bytes);
  if (!verdict.ok) {
    throw new UploadError(400, verdict.why);
  }
  const { kind } = verdict;

  let docContent: string | null = null;
  if (kind === 'document') {
    const download = await db.storage.from('canvas-assets').download(input.path);
    if (download.error || !download.data) {
      throw new UploadError(400, 'File non trovato nello storage');
    }
    docContent = await docContentFor({
      kind,
      buf: await download.data.arrayBuffer(),
      mimeType: input.mimeType,
      fileName: input.fileName
    });
  }

  const asset = await insertAsset(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    type: ASSET_TYPE_FOR_KIND[kind],
    source: 'upload',
    url: input.path,
    mimeType: input.mimeType,
    bytes: input.bytes
  });

  try {
    const data =
      kind === 'document'
        ? { content: docContent ?? '', public: false }
        : { assetId: asset.id, url: `/p/${input.projectId}/c/${input.canvasId}/assets/${asset.id}`, name: input.fileName, mimeType: input.mimeType };

    const node = await createNode(db, {
      orgId: input.orgId,
      projectId: input.projectId,
      canvasId: input.canvasId,
      type: NODE_TYPE_FOR_KIND[kind],
      x: input.x,
      y: input.y,
      data
    });

    return { asset, node };
  } catch (error) {
    await deleteAsset(db, { orgId: input.orgId, assetId: asset.id });
    throw error;
  }
}

/**
 * IL FILE RESTA, ANCHE SE QUALUNQUE PASSO DOPO FALLISCE. Chi chiama può ripulirlo esplicitamente
 * (per esempio se l'utente annulla prima di registrare), ma non è automatico qui — vedi il
 * commento sopra `registerCanvasUpload`.
 */
export async function discardCanvasUpload(db: Db, input: { path: string }): Promise<void> {
  await removeAssetFile(db, input.path);
}
