/**
 * UN'IMMAGINE O UN VIDEO STATICI: caricati, non generati.
 *
 * Il tipo resta `image`/`video` — la scelta di design è che il MEDIUM decide come un nodo si
 * collega (`graph.ts`, `upstream-inputs.ts`), non se è nato da un prompt o da un file. Un secondo
 * tipo (`upload`) avrebbe richiesto una migrazione del CHECK su `nodes.type`, una riga in più in
 * `graph.ts::CANVAS_NODE_SPECS`, `connectors.ts` e nello zod di `node-data.ts` — tre file toccati
 * per una distinzione che il connettore non ha bisogno di fare: un'immagine è un'immagine, che
 * sia nata da Seedream o da un file caricato.
 *
 * IL DISCRIMINANTE È `data.assetId`, non l'assenza di `prompt`. Un nodo `image` generato nasce
 * SEMPRE con `prompt: ''` (`newNodeRow`), quindi un prompt vuoto da solo non basta a dire
 * "questo non produce": un file caricato invece non ha mai un `assetId` finché non lo è.
 */
export type UploadedNode = {
  id: string;
  assetId: string;
  url: string;
  name: string;
  mimeType: string;
};

export function isUploadedNodeRow(row: { type: string; data: Record<string, unknown> }): boolean {
  return (row.type === 'image' || row.type === 'video') && typeof row.data.assetId === 'string';
}

export function uploadedNodeOf(row: { id: string; data: Record<string, unknown> }): UploadedNode | null {
  const assetId = row.data.assetId;
  if (typeof assetId !== 'string' || !assetId) {
    return null;
  }

  return {
    id: row.id,
    assetId,
    url: typeof row.data.url === 'string' ? row.data.url : '',
    name: typeof row.data.name === 'string' ? row.data.name : '',
    mimeType: typeof row.data.mimeType === 'string' ? row.data.mimeType : ''
  };
}
