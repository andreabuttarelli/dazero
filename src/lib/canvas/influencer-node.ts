/**
 * IL NODO `influencer`: un riferimento a una riga di `influencers`, non un carattere generato qui.
 *
 * Nasce sempre pieno — trascinato dal pannello Influencers (`influencerDrag` in `drag-payload.ts`)
 * — e non cambia mai dopo: non c'è un `onchange` che riscrive `influencer_id`, la stessa dottrina
 * di `ProductsNode` per la query ma più stretta, perché qui non c'è nemmeno un campo da editare
 * sulla tile. Le viste (nome, foto, quante sono) arrivano da fuori — il server le legge da
 * `influencer_views` e le passa come prop, mai dentro `nodes.data`.
 */

const INFLUENCER_NODE_SIZE = { w: 360, h: 460 };

export function influencerNodeSize(): { w: number; h: number } {
  return { ...INFLUENCER_NODE_SIZE };
}

export type InfluencerNode = {
  id: string;
  influencerId: string;
};

export type NodeRow = { id: string; type: string; data: Record<string, unknown> };

export function influencerNodeOf(row: NodeRow): InfluencerNode | null {
  if (row.type !== 'influencer') {
    return null;
  }

  const influencerId = row.data.influencer_id;
  if (typeof influencerId !== 'string' || !influencerId) {
    return null;
  }

  return { id: row.id, influencerId };
}
