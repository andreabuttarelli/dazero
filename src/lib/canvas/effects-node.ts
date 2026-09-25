import type { EffectStep } from './effects';

/**
 * IL NODO `effects`: una pila di effetti sopra un'immagine a monte. `sourceRefId` è l'asset che
 * ha alimentato l'ultima applicazione, `refId` il suo risultato — la stessa coppia `refId` di un
 * nodo che genera, ma senza `genState`: `applyStack` (`effects/index.ts`) gira nel browser, non
 * c'è un provider da aspettare.
 *
 * PURO: nessun database, nessun DOM. L'editor che scrive `effects`/applica la pila è la fase 3;
 * qui c'è solo la forma del nodo e la sua taglia.
 */
export type EffectsNode = {
  id: string;
  effects: EffectStep[];
  refId: string | null;
  sourceRefId: string | null;
};

const EFFECTS_NODE_SIZE = { w: 280, h: 220 };

export function effectsNodeSize(): { w: number; h: number } {
  return { ...EFFECTS_NODE_SIZE };
}

export type NewEffectsTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  effects: EffectStep[];
  connectable: true;
};

export function newEffectsNodeAt(at: { x: number; y: number }): NewEffectsTile {
  const { w, h } = effectsNodeSize();

  return {
    id: crypto.randomUUID(),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    effects: [],
    connectable: true
  };
}

const IMAGE_REF_FIELDS = ['refId', 'assetId'] as const;

export function upstreamImageRef(
  targetId: string,
  edges: { source: string; target: string }[],
  nodes: { id: string; data: Record<string, unknown> }[]
): string | null {
  for (const edge of edges) {
    if (edge.target !== targetId) {
      continue;
    }

    const source = nodes.find((node) => node.id === edge.source);
    const ref = IMAGE_REF_FIELDS.map((field) => source?.data[field]).find((v) => typeof v === 'string' && v);
    if (typeof ref === 'string') {
      return ref;
    }
  }
  return null;
}
