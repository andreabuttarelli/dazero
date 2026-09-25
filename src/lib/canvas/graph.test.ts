import { describe, it, expect } from 'vitest';
import {
  CANVAS_NODE_SPECS,
  acceptedInputs,
  canConnect,
  mediumOf,
  missingInputs,
  readyToRun,
  type CanvasNode
} from './graph';

const node = (id: string, kind: CanvasNode['kind'], over: Partial<CanvasNode> = {}): CanvasNode => ({
  id,
  kind,
  ...over
});

describe('i tipi elementari: cosa una cosa È', () => {
  it('un media porta il medium della sua riga, non quello del suo ruolo', () => {
    expect(mediumOf(node('m', 'media', { mediaKind: 'video' }))).toBe('video');
    expect(mediumOf(node('m', 'media', { mediaKind: 'image' }))).toBe('image');
  });

  it('un documento e una memoria sono testo, qualunque cosa contengano', () => {
    expect(mediumOf(node('d', 'document'))).toBe('text');
    expect(mediumOf(node('k', 'memory'))).toBe('text');
  });

  // Il punto che separa «cosa È» da «cosa FA»: un post non ha un medium suo, ce l'ha il suo
  // contenuto. Un post-video e un post-testo sono lo stesso RUOLO e due medium diversi.
  it('un post prende il medium dal suo contenuto', () => {
    expect(mediumOf(node('p', 'post', { contentType: 'generated_video' }))).toBe('video');
    expect(mediumOf(node('p', 'post', { contentType: 'text' }))).toBe('text');
    expect(mediumOf(node('p', 'post', { contentType: 'uploaded_image' }))).toBe('image');
  });
});

describe('canConnect — un arco che non produrrebbe niente si rifiuta', () => {
  it('un testo alimenta un nodo immagine: è il prompt', () => {
    expect(canConnect(node('t', 'text'), node('i', 'image')).ok).toBe(true);
  });

  it("un'immagine alimenta un nodo video: è il fotogramma di partenza", () => {
    expect(canConnect(node('i', 'image'), node('v', 'video')).ok).toBe(true);
  });

  // Il caso che rende utile la validazione: il verso conta. Un video non produce un'immagine.
  it('un video NON alimenta un nodo immagine, e dice perché', () => {
    const verdict = canConnect(node('v', 'video'), node('i', 'image'));

    // Il rifiuto porta la ragione: un arco che sparisce senza spiegazione sembra un difetto.
    expect(verdict).toEqual({ ok: false, why: expect.stringMatching(/video|immagine/i) });
  });

  it('un nodo non si collega a se stesso', () => {
    expect(canConnect(node('a', 'text'), node('a', 'text')).ok).toBe(false);
  });

  it('una sorgente di libreria non si genera: nessun arco può entrarci', () => {
    expect(canConnect(node('t', 'text'), node('m', 'media', { mediaKind: 'image' })).ok).toBe(false);
  });

  it('un post accetta testo, immagine e video insieme', () => {
    for (const k of ['text', 'image', 'video'] as const) {
      expect(canConnect(node('s', k), node('p', 'post')).ok, k).toBe(true);
    }
  });

  it('un nodo testo alimenta un altro nodo testo: il secondo può nascere dal primo', () => {
    expect(canConnect(node('a', 'text'), node('b', 'text')).ok).toBe(true);
  });

  it("un'immagine alimenta un nodo testo: un modello vision la legge come riferimento", () => {
    expect(canConnect(node('i', 'image'), node('t', 'text')).ok).toBe(true);
  });

  it('un video alimenta un nodo testo, come un riferimento multimodale', () => {
    expect(canConnect(node('v', 'video'), node('t', 'text')).ok).toBe(true);
  });
});

describe('missingInputs — un nodo dice cosa gli manca invece di fallire dopo', () => {
  it('un nodo immagine senza prompt non è pronto', () => {
    expect(missingInputs(node('i', 'image'), [])).toContain('text');
  });

  it('con il prompt collegato è pronto', () => {
    expect(missingInputs(node('i', 'image'), [node('t', 'text')])).toEqual([]);
    expect(readyToRun(node('i', 'image'), [node('t', 'text')])).toBe(true);
  });

  // Un video si può fare dal solo prompt: i riferimenti sono facoltativi, e chiederli bloccherebbe
  // un percorso che il prodotto già offre.
  it('un video si accontenta del prompt, e accetta anche dei riferimenti', () => {
    expect(readyToRun(node('v', 'video'), [node('t', 'text')])).toBe(true);
    expect(readyToRun(node('v', 'video'), [node('t', 'text'), node('i', 'image')])).toBe(true);
  });

  it('un nodo di libreria è già fatto: non gli manca niente', () => {
    expect(missingInputs(node('m', 'media', { mediaKind: 'image' }), [])).toEqual([]);
  });
});

// Misurato in `video.ts`: Seedance accetta 30 immagini, 10 video e 10 audio di riferimento, gli
// altri modelli nessuno. Un tetto uguale per tutti direbbe una bugia in entrambi i versi — troppo
// generoso per Grok, avaro per Seedance.
describe('quanti ingressi accetta un nodo, e dipende dal modello', () => {
  it('un video su Seedance accetta molte immagini, non una', () => {
    const many = Array.from({ length: 12 }, (_, i) => node(`i${i}`, 'image'));

    expect(acceptedInputs(node('v', 'video', { model: 'bytedance/seedance-2-5' }), many).rejected).toEqual([]);
  });

  it('su un modello che non li regge, i riferimenti in più si rifiutano invece di sparire', () => {
    const two = [node('i1', 'image'), node('i2', 'image')];

    const out = acceptedInputs(node('v', 'video', { model: 'grok-imagine-video-1-5-preview' }), two);

    expect(out.accepted).toHaveLength(1);
    expect(out.rejected).toHaveLength(1);
    expect(out.why).toMatch(/immagin/i);
  });

  it('oltre il tetto del modello, il sovrappiù si rifiuta', () => {
    const many = Array.from({ length: 40 }, (_, i) => node(`i${i}`, 'image'));

    const out = acceptedInputs(node('v', 'video', { model: 'bytedance/seedance-2-5' }), many);

    expect(out.accepted).toHaveLength(30);
    expect(out.rejected).toHaveLength(10);
  });

  it("un'immagine accetta un prompt solo: due prompt sono due immagini", () => {
    const out = acceptedInputs(node('i', 'image'), [node('t1', 'text'), node('t2', 'text')]);

    expect(out.accepted).toHaveLength(1);
    expect(out.rejected).toHaveLength(1);
  });

  it("un'immagine di riferimento entra: senza modello noto, una sola", () => {
    const out = acceptedInputs(node('i', 'image'), [node('r1', 'image'), node('r2', 'image')]);

    expect(out.accepted).toHaveLength(1);
    expect(out.rejected).toHaveLength(1);
  });

  it("con un modello che ne regge di più, entrano tutte fino al suo tetto", () => {
    const refs = Array.from({ length: 5 }, (_, i) => node(`r${i}`, 'image'));

    const out = acceptedInputs(node('i', 'image', { model: 'qwen3-pro' }), refs);

    expect(out.accepted).toHaveLength(3); // maxRefs di qwen3-pro
    expect(out.rejected).toHaveLength(2);
  });
});

describe('una pagina incorporata è una sorgente, come un documento', () => {
  it('non si genera: la pagina esiste già, e un arco verso di lei non farebbe niente', () => {
    expect(CANVAS_NODE_SPECS.iframe.generated).toBe(false);
  });

  it('non accetta ingressi', () => {
    expect(canConnect(node('t', 'text'), node('f', 'iframe')).ok).toBe(false);
    expect(canConnect(node('i', 'image'), node('f', 'iframe')).ok).toBe(false);
  });

  it('alimenta invece quel che si genera: è un riferimento, come un documento', () => {
    // La ragione per cui vale la pena metterla nel registro: «riassumi questa pagina» e «fai
    // un'immagine ispirata a questa» sono le due catene che la rendono utile.
    expect(canConnect(node('f', 'iframe'), node('i', 'image')).ok).toBe(true);
    expect(canConnect(node('f', 'iframe'), node('t', 'text')).ok).toBe(true);
    expect(canConnect(node('f', 'iframe'), node('p', 'post')).ok).toBe(true);
  });

  it('un documento alimenta immagine e video, come qualunque testo', () => {
    expect(canConnect(node('d', 'document'), node('i', 'image')).ok).toBe(true);
    expect(canConnect(node('d', 'document'), node('v', 'video')).ok).toBe(true);
  });

  it('è testo: quel che se ne può usare è quel che c è scritto', () => {
    expect(mediumOf(node('f', 'iframe'))).toBe('text');
  });

  it('da sola basta a far girare quel che alimenta', () => {
    // Un nodo immagine chiede un testo. Se un iframe non contasse come tale, un arco lecito
    // lascerebbe comunque il nodo «non pronto» — un vicolo cieco senza spiegazione.
    expect(readyToRun(node('i', 'image'), [node('f', 'iframe')])).toBe(true);
  });
});

describe('il registro è una tabella sola', () => {
  it('ogni tipo dichiara se si genera e cosa accetta', () => {
    for (const spec of Object.values(CANVAS_NODE_SPECS)) {
      expect(typeof spec.generated).toBe('boolean');
      expect(Array.isArray(spec.accepts)).toBe(true);
    }
  });

  it('nessun tipo che non si genera accetta ingressi: sarebbe un arco che non fa niente', () => {
    for (const [kind, spec] of Object.entries(CANVAS_NODE_SPECS)) {
      if (!spec.generated) expect(spec.accepts, kind).toEqual([]);
    }
  });
});

describe('canConnect — una lista riceve immagini o testo, mai video', () => {
  it('un\'immagine e un testo alimentano una lista', () => {
    expect(canConnect(node('i', 'image'), node('l', 'list')).ok).toBe(true);
    expect(canConnect(node('t', 'text'), node('l', 'list')).ok).toBe(true);
  });

  it('un video non alimenta una lista', () => {
    expect(canConnect(node('v', 'video'), node('l', 'list')).ok).toBe(false);
  });
});
