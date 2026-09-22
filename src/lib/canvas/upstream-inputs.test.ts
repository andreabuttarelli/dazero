import { describe, it, expect } from 'vitest';
import {
  hasUpstreamCycle,
  resolveUpstreamInputs,
  VIDEO_END_HANDLE,
  VIDEO_START_HANDLE,
  type UpstreamEdge,
  type UpstreamNode
} from './upstream-inputs';

const node = (over: Partial<UpstreamNode> & { id: string; type: string }): UpstreamNode => ({
  ...over
});

const edge = (over: Partial<UpstreamEdge> & { id: string; sourceNodeId: string; targetNodeId: string }): UpstreamEdge => ({
  ...over
});

describe('resolveUpstreamInputs — testo verso un nodo che genera', () => {
  it('un testo girato alimenta il prompt di un nodo immagine', () => {
    const nodes = [node({ id: 't1', type: 'text', text: 'un gatto rosso' }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 't1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1');

    expect(out.text).toEqual(['un gatto rosso']);
    expect(out.rejected).toEqual([]);
  });

  it("un `doc` alimenta con il suo `content`, come un nodo testo", () => {
    const nodes = [node({ id: 'd1', type: 'doc', text: 'appunti del brand' }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 'd1', targetNodeId: 'i1' })];

    expect(resolveUpstreamInputs(nodes, edges, 'i1').text).toEqual(['appunti del brand']);
  });

  it('un nodo testo non ancora girato non alimenta niente, e lo dice', () => {
    const nodes = [node({ id: 't1', type: 'text', text: null }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 't1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1');

    expect(out.text).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 't1', why: expect.stringContaining('non ancora girato') }]);
  });
});

describe('resolveUpstreamInputs — immagine verso immagine', () => {
  it("un'immagine girata alimenta come riferimento, non come testo", () => {
    const nodes = [
      node({ id: 'src', type: 'image', mediaUrl: 'https://cdn/img.png' }),
      node({ id: 'i1', type: 'image' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'src', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1');

    expect(out.referenceImageUrl).toBe('https://cdn/img.png');
    expect(out.referenceImageUrls).toEqual(['https://cdn/img.png']);
    expect(out.text).toEqual([]);
  });

  it('un nodo immagine non ancora girato non porta un riferimento, e lo dice', () => {
    const nodes = [node({ id: 'src', type: 'image', mediaUrl: null }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 'src', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1');

    expect(out.referenceImageUrl).toBeNull();
    expect(out.rejected).toEqual([{ nodeId: 'src', why: expect.stringContaining('non ancora girato') }]);
  });

  it('senza un modello noto, un nodo immagine accetta un solo riferimento — il resto si rifiuta', () => {
    const nodes = [
      node({ id: 'i1', type: 'image' }),
      node({ id: 'r1', type: 'image', mediaUrl: 'https://cdn/1.png' }),
      node({ id: 'r2', type: 'image', mediaUrl: 'https://cdn/2.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'r1', targetNodeId: 'i1' }),
      edge({ id: 'e2', sourceNodeId: 'r2', targetNodeId: 'i1' })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'i1');

    expect(out.referenceImageUrls).toEqual(['https://cdn/1.png']);
    expect(out.rejected).toEqual([{ nodeId: 'r2', why: expect.any(String) }]);
  });

  it('con un modello che regge più riferimenti (qwen3-pro, maxRefs 3), tutti entrano', () => {
    const nodes = [
      node({ id: 'i1', type: 'image', model: 'qwen3-pro' }),
      node({ id: 'r1', type: 'image', mediaUrl: 'https://cdn/1.png' }),
      node({ id: 'r2', type: 'image', mediaUrl: 'https://cdn/2.png' }),
      node({ id: 'r3', type: 'image', mediaUrl: 'https://cdn/3.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'r1', targetNodeId: 'i1' }),
      edge({ id: 'e2', sourceNodeId: 'r2', targetNodeId: 'i1' }),
      edge({ id: 'e3', sourceNodeId: 'r3', targetNodeId: 'i1' })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'i1');

    expect(out.referenceImageUrls).toEqual(['https://cdn/1.png', 'https://cdn/2.png', 'https://cdn/3.png']);
    expect(out.rejected).toEqual([]);
  });
});

describe('resolveUpstreamInputs — ordine deterministico', () => {
  // Un solo prompt entra per nodo (`graph.ts`: due testi sono due immagini) — l'ordine si vede
  // dove più di un ingresso è ammesso davvero: più immagini di riferimento, su un modello che le
  // regge.
  it("due riferimenti entrano nell'ordine della maniglia, poi dell'id dell'arco", () => {
    const nodes = [
      node({ id: 'i1', type: 'image', model: 'qwen3-pro' }),
      node({ id: 'rb', type: 'image', mediaUrl: 'https://cdn/B.png' }),
      node({ id: 'ra', type: 'image', mediaUrl: 'https://cdn/A.png' })
    ];
    const edges = [
      edge({ id: 'e2', sourceNodeId: 'rb', targetNodeId: 'i1', sourceHandle: 'b' }),
      edge({ id: 'e1', sourceNodeId: 'ra', targetNodeId: 'i1', sourceHandle: 'a' })
    ];

    expect(resolveUpstreamInputs(nodes, edges, 'i1').referenceImageUrls).toEqual([
      'https://cdn/A.png',
      'https://cdn/B.png'
    ]);
  });

  it('senza maniglia, lo spareggio è l\'id dell\'arco — stesso risultato a ogni chiamata', () => {
    const nodes = [
      node({ id: 'i1', type: 'image', model: 'qwen3-pro' }),
      node({ id: 'r1', type: 'image', mediaUrl: 'https://cdn/uno.png' }),
      node({ id: 'r2', type: 'image', mediaUrl: 'https://cdn/due.png' })
    ];
    const edges = [
      edge({ id: 'zeta', sourceNodeId: 'r2', targetNodeId: 'i1' }),
      edge({ id: 'alfa', sourceNodeId: 'r1', targetNodeId: 'i1' })
    ];

    const first = resolveUpstreamInputs(nodes, edges, 'i1').referenceImageUrls;
    const second = resolveUpstreamInputs(nodes, [...edges].reverse(), 'i1').referenceImageUrls;

    expect(first).toEqual(['https://cdn/uno.png', 'https://cdn/due.png']);
    expect(second).toEqual(first);
  });
});

describe('resolveUpstreamInputs — video: fotogrammi e riferimenti', () => {
  const seedance = 'bytedance/seedance-2-5';

  it("un'immagine sulla maniglia `start_frame` diventa il fotogramma iniziale", () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'img', type: 'image', mediaUrl: 'https://cdn/cover.png' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'img', targetNodeId: 'v1', targetHandle: VIDEO_START_HANDLE })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1');

    expect(out.startFrameUrl).toBe('https://cdn/cover.png');
    expect(out.endFrameUrl).toBeNull();
  });

  it('un secondo frame su `end_frame` diventa il fotogramma finale', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'first', type: 'image', mediaUrl: 'https://cdn/first.png' }),
      node({ id: 'last', type: 'image', mediaUrl: 'https://cdn/last.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'first', targetNodeId: 'v1', targetHandle: VIDEO_START_HANDLE }),
      edge({ id: 'e2', sourceNodeId: 'last', targetNodeId: 'v1', targetHandle: VIDEO_END_HANDLE })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'v1');

    expect(out.startFrameUrl).toBe('https://cdn/first.png');
    expect(out.endFrameUrl).toBe('https://cdn/last.png');
  });

  it('un `end_frame` senza `start_frame` si rifiuta invece di partire da un frame finale solo', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'last', type: 'image', mediaUrl: 'https://cdn/last.png' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'last', targetNodeId: 'v1', targetHandle: VIDEO_END_HANDLE })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1');

    expect(out.endFrameUrl).toBeNull();
    expect(out.rejected).toContainEqual({ nodeId: 'v1', why: expect.stringContaining('fotogramma') });
  });

  it('immagini senza maniglia: la prima è il fotogramma iniziale, le altre sono riferimenti', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'a', type: 'image', mediaUrl: 'https://cdn/a.png' }),
      node({ id: 'b', type: 'image', mediaUrl: 'https://cdn/b.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'v1' }),
      edge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'v1' })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'v1');

    expect(out.startFrameUrl).toBe('https://cdn/a.png');
    expect(out.referenceImageUrls).toEqual(['https://cdn/b.png']);
  });

  it('oltre il tetto del modello (Seedance 2.5: 30 immagini), il sovrappiù si rifiuta con la ragione', () => {
    const refs = Array.from({ length: 31 }, (_, i) => node({ id: `r${i}`, type: 'image', mediaUrl: `https://cdn/${i}.png` }));
    const nodes = [node({ id: 'v1', type: 'video', model: seedance }), ...refs];
    const edges = refs.map((r, i) => edge({ id: `e${i}`, sourceNodeId: r.id, targetNodeId: 'v1' }));

    const out = resolveUpstreamInputs(nodes, edges, 'v1');

    // `videoRefCapacity` accetta 30 immagini in tutto: una diventa il fotogramma iniziale, le
    // altre 29 sono riferimenti — la trentunesima si rifiuta.
    expect(out.startFrameUrl).not.toBeNull();
    expect(out.referenceImageUrls).toHaveLength(29);
    expect(out.rejected).toHaveLength(1);
  });

  it('un modello che non regge riferimenti multimodali (Grok) accetta solo il fotogramma iniziale', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: 'grok-imagine-video-1-5-preview' }),
      node({ id: 'a', type: 'image', mediaUrl: 'https://cdn/a.png' }),
      node({ id: 'b', type: 'image', mediaUrl: 'https://cdn/b.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'v1' }),
      edge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'v1' })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'v1');

    expect(out.startFrameUrl).toBe('https://cdn/a.png');
    expect(out.referenceImageUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 'b', why: expect.any(String) }]);
  });
});

describe('resolveUpstreamInputs — cicli: mai un giro infinito', () => {
  it('A → B → A si riconosce', () => {
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' }),
      edge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'a' })
    ];

    expect(hasUpstreamCycle(edges, 'a')).toBe(true);
  });

  it('una catena senza ciclo non si segnala', () => {
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' }),
      edge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'c' })
    ];

    expect(hasUpstreamCycle(edges, 'c')).toBe(false);
  });

  it('un nodo dentro un ciclo non risolve input e dice perché, invece di girare per sempre', () => {
    const nodes = [
      node({ id: 'a', type: 'image', mediaUrl: 'https://cdn/a.png' }),
      node({ id: 'b', type: 'image', mediaUrl: 'https://cdn/b.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' }),
      edge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'a' })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'a');

    expect(out.rejected).toEqual([{ nodeId: 'a', why: expect.stringContaining('ciclo') }]);
    expect(out.text).toEqual([]);
    expect(out.referenceImageUrls).toEqual([]);
  });
});

describe('resolveUpstreamInputs — nodo assente', () => {
  it('un target che non esiste torna vuoto, non un errore', () => {
    expect(resolveUpstreamInputs([], [], 'assente')).toMatchObject({ text: [], rejected: [] });
  });
});
