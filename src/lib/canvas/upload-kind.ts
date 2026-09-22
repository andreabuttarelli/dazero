/**
 * TRE COSE DIVERSE ENTRANO DA UN UPLOAD, E QUESTO FILE DECIDE QUALE.
 *
 * L'icona di upload nella barra accetta un file solo, ma quel file può diventare tre cose sulla
 * tela: un'immagine statica, un video statico, o un documento convertito in markdown dentro un
 * nodo `doc`. La decisione è dal MIME/estensione, in un posto solo — client e server la fanno
 * nello stesso modo, o un file che il client accetta e il server rifiuta (o viceversa) è un
 * upload che sembra riuscito e non lo è.
 *
 * OGNI KIND HA IL SUO TETTO. Un'immagine e un documento passano dentro il corpo di un'azione
 * SvelteKit — Vercel taglia quel corpo a ~4.5MB, quindi anche il tetto "generoso" resta sotto
 * quella soglia. Un video no: la clip va dritta nello Storage dal browser (lo stesso schema che
 * `studio-actions.ts::uploadDocument` e `chat-attachments.ts` già usano per lo stesso motivo), e
 * il suo tetto lo decide solo cosa è ragionevole caricare, non il corpo di una richiesta.
 */
export const UPLOAD_KINDS = ['image', 'video', 'document'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

/**
 * Le stesse estensioni che `convertFileToMarkdown` sa leggere davvero (`chat-documents.ts`,
 * `CONVERTIBLE_EXTS`) — un file che questo elenco accetta e quella funzione non sa convertire è
 * un upload che finisce in un nodo `doc` vuoto senza che nessuno lo dica.
 */
const DOCUMENT_EXT = new Set([
  'pdf', 'docx', 'xlsx', 'xls', 'html', 'htm', 'csv', 'txt', 'md', 'markdown', 'xml', 'rss', 'atom', 'ipynb'
]);

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function uploadKindOf(mimeType: string, fileName: string): UploadKind | null {
  const mime = mimeType.toLowerCase();
  if (IMAGE_MIME.has(mime)) return 'image';
  if (VIDEO_MIME.has(mime)) return 'video';
  if (DOCUMENT_EXT.has(extOf(fileName))) return 'document';
  return null;
}

const MB = 1024 * 1024;

/**
 * Immagine e documento passano dentro il corpo di un'azione: restano sotto il tetto di Vercel
 * (~4.5MB) con margine. Il video va dritto in Storage dal browser — vedi il commento in cima —
 * quindi il suo tetto è un fatto di prodotto, non della piattaforma: 200MB è una clip corta in
 * buona qualità, non un montaggio.
 */
export const UPLOAD_MAX_BYTES: Record<UploadKind, number> = {
  image: 4 * MB,
  document: 4 * MB,
  video: 200 * MB
};

/**
 * LA CARTELLA CHE LA RLS DI `canvas-assets` AUTORIZZA (`20260922_canvas_asset_buckets.sql`):
 * `(storage.foldername(name))[1]` deve essere l'org. Client e server costruiscono lo stesso
 * percorso da questa funzione sola — il server lo verifica (`registerCanvasUpload`), il client
 * lo usa per sapere dove caricare prima ancora di chiamare il server.
 */
export function canvasUploadPrefix(orgId: string, projectId: string): string {
  return `${orgId}/${projectId}/`;
}

export type UploadVerdict = { ok: true; kind: UploadKind } | { ok: false; why: string };

export function verdictForUpload(mimeType: string, fileName: string, bytes: number): UploadVerdict {
  if (!bytes) {
    return { ok: false, why: 'File vuoto' };
  }

  const kind = uploadKindOf(mimeType, fileName);
  if (!kind) {
    return { ok: false, why: 'Formato non supportato: scegli un\'immagine, un video o un documento' };
  }

  const ceiling = UPLOAD_MAX_BYTES[kind];
  if (bytes > ceiling) {
    return { ok: false, why: `${labelFor(kind)}: al massimo ${ceiling / MB}MB` };
  }

  return { ok: true, kind };
}

function labelFor(kind: UploadKind): string {
  if (kind === 'image') return 'Immagine';
  if (kind === 'video') return 'Video';
  return 'Documento';
}
