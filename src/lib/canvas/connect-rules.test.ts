import { describe, it, expect } from 'vitest';
import {
  edgeKindsFor,
  verdictBetween,
  DEFAULT_EDGE_KIND,
  tileNode,
  type NodeLookup
} from './connect-rules';
import type { CanvasNode } from './graph';

const lookup = (nodes: Record<string, CanvasNode>): NodeLookup => (id) => nodes[id] ?? null;

const text: CanvasNode = { id: 't', kind: 'text' };
const image: CanvasNode = { id: 'i', kind: 'image' };
const video: CanvasNode = { id: 'v', kind: 'video' };
const frame: CanvasNode = { id: 'f', kind: 'iframe' };

describe('verdictBetween — il verdetto che si dà mentre il puntatore è in aria', () => {
  it('un testo verso un nodo immagine passa: è il prompt', () => {
    const at = lookup({ t: text, i: image });

    expect(verdictBetween(at, 't', 'i')).toEqual({ ok: true });
  });

  it("un'immagine verso un nodo immagine si rifiuta, e dice perché", () => {
    const at = lookup({ i: image, i2: { ...image, id: 'i2' } });
    const verdict = verdictBetween(at, 'i', 'i2');

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toContain('immagine');
  });

  it('un arco verso una sorgente si rifiuta: una pagina incorporata non si genera', () => {
    const at = lookup({ t: text, f: frame });
    const verdict = verdictBetween(at, 't', 'f');

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toContain('iframe');
  });

  it('un nodo verso se stesso si rifiuta prima di arrivare a `canConnect`', () => {
    const at = lookup({ v: video });

    expect(verdictBetween(at, 'v', 'v').ok).toBe(false);
  });

  /**
   * IL CASO CHE DECIDE SE LA TELA RESTA USABILE. Il recap del workbench non è un `CanvasNode`, e
   * nemmeno una tile che il chiamante non ha ancora descritto: rifiutare ciò che non si conosce
   * bloccherebbe archi leciti fra cose vere. Chi non si collega lo dice con `connectable: false`,
   * che è un'altra domanda e un altro posto.
   */
  it('una tile senza tipo non si rifiuta: non si sa abbastanza per dire di no', () => {
    const at = lookup({ t: text });

    expect(verdictBetween(at, 't', 'recap').ok).toBe(true);
    expect(verdictBetween(at, 'recap', 't').ok).toBe(true);
  });
});

describe('edgeKindsFor — quali versi ha senso proporre', () => {
  it('i tre versi restano tutti disponibili su un arco lecito', () => {
    const at = lookup({ t: text, i: image });

    expect(edgeKindsFor(at, 't', 'i')).toEqual(['derives_from', 'responds_to', 'groups_with']);
  });

  /**
   * `groups_with` non dice che uno viene dall'altro: dice che stanno insieme. Nessuna regola di
   * `graph.ts` lo governa — non c'è un medium che alimenta un raggruppamento — quindi resta
   * l'unico verso possibile quando l'arco «che produce» non ha senso.
   */
  it('su una coppia che non si alimenta resta solo lo stare insieme', () => {
    const at = lookup({ i: image, i2: { ...image, id: 'i2' } });

    expect(edgeKindsFor(at, 'i', 'i2')).toEqual(['groups_with']);
  });

  it('il verso proposto per primo è quello che si salva senza chiedere niente', () => {
    const at = lookup({ t: text, i: image });

    expect(edgeKindsFor(at, 't', 'i')[0]).toBe(DEFAULT_EDGE_KIND);
  });
});

describe('tileNode — da quel che la pagina ha in mano al vocabolario del modello', () => {
  it('un nodo che produce porta il suo medium come tipo, e il suo modello', () => {
    expect(tileNode({ id: 'g1', medium: 'video', model: 'seedance' })).toEqual({
      id: 'g1',
      kind: 'video',
      model: 'seedance'
    });
  });

  /**
   * Una pagina incorporata non ha un medium suo da scegliere: è sempre `iframe`, che `graph.ts`
   * governa come sorgente di testo. Senza questo caso il chiamante lo scriverebbe a mano ogni
   * volta che aggiunge una superficie, e la seconda copia direbbe un'altra cosa.
   */
  it("una pagina incorporata è del tipo `iframe`, e non porta modello", () => {
    expect(tileNode({ id: 'f1' })).toEqual({ id: 'f1', kind: 'iframe', model: null });
  });
});
