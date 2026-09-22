/**
 * COSA DIVENTA UN NODO QUANDO ARRIVA TRASCINATO DA FUORI LA TELA — dalla libreria degli asset o
 * dalla lista dei brand. Una tabella sola, non un `if` per ogni pannello che trascina qualcosa:
 * `DRAG_NODE_KIND` risponde "che tipo di nodo nasce" per ogni origine, e le funzioni sotto
 * costruiscono `data` già nella forma che `nodes_data_shape_check` (vedi la migration
 * `20260922_jsonb_check_constraints.sql`) e gli zod di `node-data.ts` accettano.
 *
 * UN NODO STATICO, NON GENERATO. Un'immagine o un video trascinati prendono `type: 'image'`
 * o `type: 'video'` con `data.assetId` valorizzato — lo stesso discriminante di
 * `uploaded-node.ts::isUploadedNodeRow`: un upload e un drag sono la stessa cosa sulla tela,
 * un file che esiste già, non un prompt da far girare. `prompt: ''` soddisfa il CHECK, che per
 * `image`/`video` chiede solo quello — `assetId` non è nel CHECK apposta (vedi il commento in
 * `uploaded-node.ts`), ma è lui a far apparire il tag "caricato" invece del pulsante "Genera".
 */
export type DragAssetKind = 'image' | 'video' | 'document';
export type DragBrandField = 'logo' | 'text' | 'content';

export const DRAG_NODE_KIND: {
  asset: Record<DragAssetKind, 'image' | 'video' | 'doc'>;
  brand: Record<DragBrandField, 'image' | 'text' | 'doc'>;
} = {
  asset: {
    image: 'image',
    video: 'video',
    document: 'doc'
  },
  brand: {
    logo: 'image',
    text: 'text',
    content: 'doc'
  }
};

export type StaticImageOrVideoData = {
  prompt: '';
  assetId: string;
  url: string;
  name: string;
  mimeType: string;
};

export function staticMediaData(input: {
  assetId: string;
  url: string;
  name: string;
  mimeType: string;
}): StaticImageOrVideoData {
  return { prompt: '', assetId: input.assetId, url: input.url, name: input.name, mimeType: input.mimeType };
}

export type StaticTextData = { prompt: string };

export function staticTextData(text: string): StaticTextData {
  return { prompt: text };
}

export type StaticDocData = { content: string; public: false };

export function staticDocData(content: string): StaticDocData {
  return { content, public: false };
}
