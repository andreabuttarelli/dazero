import { describe, it, expect } from 'vitest';
import {
  hasUpstreamCycle,
  resolveUpstreamInputs,
  FIRST_FRAME_HANDLE,
  LAST_FRAME_HANDLE,
  type UpstreamEdge,
  type UpstreamNode
} from './upstream-inputs';
import type { Modalities } from './connectors';

const node = (over: Partial<UpstreamNode> & { id: string; type: string }): UpstreamNode => ({
  ...over
});

const edge = (over: Partial<UpstreamEdge> & { id: string; sourceNodeId: string; targetNodeId: string }): UpstreamEdge => ({
  ...over
});

// Le modalità che un target userebbe: sincronizzate da `ai_models`, sempre presenti — il
// selettore modello offre solo righe sincronizzate (decisione di prodotto), quindi qui non esiste
// un caso "modello scelto, modalità ignote" da simulare.
const TEXT_IMAGE: Modalities = { input: ['text', 'image'] };
const TEXT_ONLY: Modalities = { input: ['text'] };
const TEXT_IMAGE_VIDEO_AUDIO: Modalities = { input: ['text', 'image', 'video', 'audio'] };

describe('resolveUpstreamInputs — testo verso un nodo che genera', () => {
  it('un testo girato alimenta il prompt di un nodo immagine', () => {
    const nodes = [node({ id: 't1', type: 'text', text: 'un gatto rosso' }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 't1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

    expect(out.text).toEqual(['un gatto rosso']);
    expect(out.rejected).toEqual([]);
  });

  it("un `doc` alimenta con il suo `content`, come un nodo testo", () => {
    const nodes = [node({ id: 'd1', type: 'doc', text: 'appunti del brand' }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 'd1', targetNodeId: 'i1' })];

    expect(resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE).text).toEqual(['appunti del brand']);
  });

  it('un nodo testo non ancora girato non alimenta niente, e lo dice', () => {
    const nodes = [node({ id: 't1', type: 'text', text: null }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 't1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

    expect(out.text).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 't1', why: expect.stringContaining('non ancora girato') }]);
  });

  it('un modello che non ha il connettore testo (caso limite: nessuna modalità testo) rifiuta il testo collegato', () => {
    const nodes = [node({ id: 't1', type: 'text', text: 'ciao' }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 't1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', { input: ['image'] });

    expect(out.text).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 't1', why: expect.stringContaining('connettore') }]);
  });
});

describe('resolveUpstreamInputs — immagine verso immagine', () => {
  it("un'immagine girata alimenta come riferimento, non come testo", () => {
    const nodes = [
      node({ id: 'src', type: 'image', mediaUrl: 'https://cdn/img.png' }),
      node({ id: 'i1', type: 'image' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'src', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

    expect(out.referenceImageUrl).toBe('https://cdn/img.png');
    expect(out.referenceImageUrls).toEqual(['https://cdn/img.png']);
    expect(out.text).toEqual([]);
  });

  it('un nodo immagine non ancora girato non porta un riferimento, e lo dice', () => {
    const nodes = [node({ id: 'src', type: 'image', mediaUrl: null }), node({ id: 'i1', type: 'image' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 'src', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

    expect(out.referenceImageUrl).toBeNull();
    expect(out.rejected).toEqual([{ nodeId: 'src', why: expect.stringContaining('non ancora girato') }]);
  });

  it('un modello che non ha il connettore immagini (solo testo) rifiuta l\'immagine collegata', () => {
    const nodes = [
      node({ id: 'i1', type: 'image' }),
      node({ id: 'r1', type: 'image', mediaUrl: 'https://cdn/1.png' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'r1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_ONLY);

    expect(out.referenceImageUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 'r1', why: expect.stringContaining('connettore') }]);
  });

  it('senza un modello noto nel catalogo integrazione (`maxRefs`), un nodo immagine accetta un solo riferimento', () => {
    const nodes = [
      node({ id: 'i1', type: 'image' }),
      node({ id: 'r1', type: 'image', mediaUrl: 'https://cdn/1.png' }),
      node({ id: 'r2', type: 'image', mediaUrl: 'https://cdn/2.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'r1', targetNodeId: 'i1' }),
      edge({ id: 'e2', sourceNodeId: 'r2', targetNodeId: 'i1' })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

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

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

    expect(out.referenceImageUrls).toEqual(['https://cdn/1.png', 'https://cdn/2.png', 'https://cdn/3.png']);
    expect(out.rejected).toEqual([]);
  });
});

describe('resolveUpstreamInputs — ordine deterministico', () => {
  // Un solo prompt entra per nodo — l'ordine si vede dove più di un ingresso è ammesso davvero:
  // più immagini di riferimento, su un modello che le regge.
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

    expect(resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE).referenceImageUrls).toEqual([
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

    const first = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE).referenceImageUrls;
    const second = resolveUpstreamInputs(nodes, [...edges].reverse(), 'i1', TEXT_IMAGE).referenceImageUrls;

    expect(first).toEqual(['https://cdn/uno.png', 'https://cdn/due.png']);
    expect(second).toEqual(first);
  });
});

describe('resolveUpstreamInputs — video: fotogrammi e riferimenti', () => {
  const seedance = 'bytedance/seedance-2-5';

  it("un'immagine sullo slot `first_frame` diventa il fotogramma iniziale", () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'img', type: 'image', mediaUrl: 'https://cdn/cover.png' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'img', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.startFrameUrl).toBe('https://cdn/cover.png');
    expect(out.endFrameUrl).toBeNull();
  });

  it('due frame, uno per slot, diventano fotogramma iniziale e finale', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'first', type: 'image', mediaUrl: 'https://cdn/first.png' }),
      node({ id: 'last', type: 'image', mediaUrl: 'https://cdn/last.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'first', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE }),
      edge({ id: 'e2', sourceNodeId: 'last', targetNodeId: 'v1', targetHandle: LAST_FRAME_HANDLE })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.startFrameUrl).toBe('https://cdn/first.png');
    expect(out.endFrameUrl).toBe('https://cdn/last.png');
  });

  it('uno slot `last_frame` da solo, senza `first_frame`, PASSA: sono opzionali e indipendenti', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'last', type: 'image', mediaUrl: 'https://cdn/last.png' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'last', targetNodeId: 'v1', targetHandle: LAST_FRAME_HANDLE })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.startFrameUrl).toBeNull();
    expect(out.endFrameUrl).toBe('https://cdn/last.png');
    expect(out.rejected).toEqual([]);
  });

  it('due immagini sullo stesso slot sono un conflitto: la seconda si rifiuta, nominando lo slot', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'a', type: 'image', mediaUrl: 'https://cdn/a.png' }),
      node({ id: 'b', type: 'image', mediaUrl: 'https://cdn/b.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE }),
      edge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.startFrameUrl).toBe('https://cdn/a.png');
    expect(out.rejected).toEqual([{ nodeId: 'b', why: expect.stringContaining(FIRST_FRAME_HANDLE) }]);
  });

  it('immagini SENZA maniglia sono sempre riferimenti — nessuna diventa fotogramma per default', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'a', type: 'image', mediaUrl: 'https://cdn/a.png' }),
      node({ id: 'b', type: 'image', mediaUrl: 'https://cdn/b.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'v1' }),
      edge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'v1' })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.startFrameUrl).toBeNull();
    expect(out.referenceImageUrls).toEqual(['https://cdn/a.png', 'https://cdn/b.png']);
  });

  it('oltre il tetto del modello (Seedance 2.5: 30 immagini), il sovrappiù si rifiuta con la ragione', () => {
    const refs = Array.from({ length: 31 }, (_, i) => node({ id: `r${i}`, type: 'image', mediaUrl: `https://cdn/${i}.png` }));
    const nodes = [node({ id: 'v1', type: 'video', model: seedance }), ...refs];
    const edges = refs.map((r, i) => edge({ id: `e${i}`, sourceNodeId: r.id, targetNodeId: 'v1' }));

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    // `videoRefCapacity` accetta 30 immagini in tutto, tutte riferimenti senza maniglia — la
    // trentunesima si rifiuta.
    expect(out.startFrameUrl).toBeNull();
    expect(out.referenceImageUrls).toHaveLength(30);
    expect(out.rejected).toHaveLength(1);
  });

  it('un modello che non regge riferimenti multimodali (Grok) rifiuta le immagini oltre la prima', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: 'grok-imagine-video-1-5-preview' }),
      node({ id: 'a', type: 'image', mediaUrl: 'https://cdn/a.png' }),
      node({ id: 'b', type: 'image', mediaUrl: 'https://cdn/b.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'v1' }),
      edge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'v1' })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE);

    // Grok tiene un'immagine (`Math.max(caps.images, 1)`, in `upstream-inputs.ts::listCapacity`)
    // — senza maniglia resta un riferimento, non un fotogramma implicito.
    expect(out.startFrameUrl).toBeNull();
    expect(out.referenceImageUrls).toEqual(['https://cdn/a.png']);
    expect(out.rejected).toEqual([{ nodeId: 'b', why: expect.any(String) }]);
  });

  it('la maniglia vince sempre: un\'immagine su `first_frame` è un fotogramma anche fra riferimenti', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: seedance }),
      node({ id: 'cover', type: 'image', mediaUrl: 'https://cdn/cover.png' }),
      node({ id: 'mood', type: 'image', mediaUrl: 'https://cdn/mood.png' })
    ];
    const edges = [
      edge({ id: 'e1', sourceNodeId: 'mood', targetNodeId: 'v1' }),
      edge({ id: 'e2', sourceNodeId: 'cover', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE })
    ];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.startFrameUrl).toBe('https://cdn/cover.png');
    expect(out.referenceImageUrls).toEqual(['https://cdn/mood.png']);
  });

  it('un modello video senza il connettore immagini (solo testo) non ha slot di fotogramma: un\'immagine collegata si rifiuta', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: 'text-only-video' }),
      node({ id: 'img', type: 'image', mediaUrl: 'https://cdn/cover.png' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'img', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_ONLY);

    expect(out.startFrameUrl).toBeNull();
    expect(out.rejected).toEqual([{ nodeId: 'img', why: expect.stringContaining('connettore') }]);
  });
});

describe('resolveUpstreamInputs — video verso video: riferimento, mai un fotogramma', () => {
  it('un video collegato a un video entra come riferimento multimodale', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: 'bytedance/seedance-2-5' }),
      node({ id: 'src', type: 'video', mediaUrl: 'https://cdn/clip.mp4' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'src', targetNodeId: 'v1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.referenceVideoUrls).toEqual(['https://cdn/clip.mp4']);
    expect(out.startFrameUrl).toBeNull();
  });

  it('anche su una maniglia di fotogramma, un video resta un riferimento — non ha un frame solo', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: 'bytedance/seedance-2-5' }),
      node({ id: 'src', type: 'video', mediaUrl: 'https://cdn/clip.mp4' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'src', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.referenceVideoUrls).toEqual(['https://cdn/clip.mp4']);
    expect(out.startFrameUrl).toBeNull();
  });

  it('un nodo video non ancora girato non porta un riferimento, e lo dice', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: 'bytedance/seedance-2-5' }),
      node({ id: 'src', type: 'video', mediaUrl: null })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'src', targetNodeId: 'v1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.referenceVideoUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 'src', why: expect.stringContaining('non ancora girato') }]);
  });

  it('un modello senza il connettore video rifiuta il riferimento video collegato', () => {
    const nodes = [
      node({ id: 'v1', type: 'video', model: 'grok-imagine-video-1-5-preview' }),
      node({ id: 'src', type: 'video', mediaUrl: 'https://cdn/clip.mp4' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'src', targetNodeId: 'v1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE);

    expect(out.referenceVideoUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 'src', why: expect.stringContaining('connettore') }]);
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

    const out = resolveUpstreamInputs(nodes, edges, 'a', TEXT_IMAGE);

    expect(out.rejected).toEqual([{ nodeId: 'a', why: expect.stringContaining('ciclo') }]);
    expect(out.text).toEqual([]);
    expect(out.referenceImageUrls).toEqual([]);
  });
});

describe('resolveUpstreamInputs — nodo assente o non generativo', () => {
  it('un target che non esiste torna vuoto, non un errore', () => {
    expect(resolveUpstreamInputs([], [], 'assente', TEXT_IMAGE)).toMatchObject({ text: [], rejected: [] });
  });

  it('un target non generativo (`doc`, `iframe`, …) rifiuta di risolvere input: non si genera da altri nodi', () => {
    const nodes = [node({ id: 'd1', type: 'doc' })];

    const out = resolveUpstreamInputs(nodes, [], 'd1', TEXT_IMAGE);

    expect(out.rejected).toEqual([{ nodeId: 'd1', why: expect.stringContaining('non si genera') }]);
  });
});

describe('resolveUpstreamInputs — un\'immagine caricata, non generata', () => {
  // Un nodo `image` senza prompt (l'upload statico: `data.assetId` presente, niente `prompt`) è
  // ancora `type: 'image'` per questo file — la scelta di design è proprio questa: il MEDIUM
  // decide il collegamento, non se quell'immagine è nata da un giro o da un file caricato.
  // Nessun cambiamento a `KIND_MAP`/`toCanvasKind` serve: un `type: 'image'` con `mediaUrl` già
  // risolve come riferimento o come fotogramma, identico a un'immagine generata.
  it('alimenta il connettore immagini come un\'immagine generata', () => {
    const nodes = [
      node({ id: 'u1', type: 'image', mediaUrl: 'https://cdn/upload.png' }),
      node({ id: 'v1', type: 'video' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'u1', targetNodeId: 'v1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.referenceImageUrls).toEqual(['https://cdn/upload.png']);
    expect(out.rejected).toEqual([]);
  });

  it('alimenta il fotogramma iniziale quando è collegata su quella maniglia', () => {
    const nodes = [
      node({ id: 'u1', type: 'image', mediaUrl: 'https://cdn/upload.png' }),
      node({ id: 'v1', type: 'video' })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'u1', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.startFrameUrl).toBe('https://cdn/upload.png');
  });
});

describe('resolveUpstreamInputs — un influencer porta tutte le sue viste, non una sola', () => {
  // Un influencer non è un'immagine sola: `mediaUrls` porta ogni vista, già nell'ordine di
  // `sort_order` (compito del chiamante, non di questo file — vedi il commento su `mediaUrls`).
  // Un solo arco, molte immagini di riferimento: la stessa maniglia che per un nodo `image`
  // porterebbe un filo solo qui ne porta quanti la vista ne conta, fino al tetto del modello.
  it('le viste di un influencer diventano tutte immagini di riferimento, nel loro ordine', () => {
    const nodes = [
      node({ id: 'i1', type: 'image', model: 'qwen3-pro' }),
      node({ id: 'inf1', type: 'influencer', mediaUrls: ['https://cdn/front.png', 'https://cdn/profile.png'] })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'inf1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

    expect(out.referenceImageUrls).toEqual(['https://cdn/front.png', 'https://cdn/profile.png']);
    expect(out.referenceImageUrl).toBe('https://cdn/front.png');
    expect(out.rejected).toEqual([]);
  });

  it('le viste oltre il tetto del modello si rifiutano una per una, con il motivo', () => {
    const nodes = [
      node({ id: 'i1', type: 'image' }),
      node({ id: 'inf1', type: 'influencer', mediaUrls: ['https://cdn/a.png', 'https://cdn/b.png'] })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'inf1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

    expect(out.referenceImageUrls).toEqual(['https://cdn/a.png']);
    expect(out.rejected).toEqual([{ nodeId: 'inf1', why: expect.any(String) }]);
  });

  it('un influencer collegato a un modello senza connettore immagini si rifiuta come un\'immagine', () => {
    const nodes = [
      node({ id: 'i1', type: 'image' }),
      node({ id: 'inf1', type: 'influencer', mediaUrls: ['https://cdn/a.png'] })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'inf1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_ONLY);

    expect(out.referenceImageUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 'inf1', why: expect.stringContaining('connettore') }]);
  });

  it('un influencer senza viste ancora caricate non alimenta niente', () => {
    const nodes = [node({ id: 'i1', type: 'image' }), node({ id: 'inf1', type: 'influencer' })];
    const edges = [edge({ id: 'e1', sourceNodeId: 'inf1', targetNodeId: 'i1' })];

    const out = resolveUpstreamInputs(nodes, edges, 'i1', TEXT_IMAGE);

    expect(out.referenceImageUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 'inf1', why: expect.stringContaining('non ancora') }]);
  });

  it('un influencer collegato al fotogramma iniziale porta solo la prima vista', () => {
    const nodes = [
      node({ id: 'v1', type: 'video' }),
      node({ id: 'inf1', type: 'influencer', mediaUrls: ['https://cdn/front.png', 'https://cdn/profile.png'] })
    ];
    const edges = [edge({ id: 'e1', sourceNodeId: 'inf1', targetNodeId: 'v1', targetHandle: FIRST_FRAME_HANDLE })];

    const out = resolveUpstreamInputs(nodes, edges, 'v1', TEXT_IMAGE_VIDEO_AUDIO);

    expect(out.startFrameUrl).toBe('https://cdn/front.png');
  });
});
