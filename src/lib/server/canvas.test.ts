import { describe, it, expect, vi } from 'vitest';
import { hydrateCanvasItems, saveCanvasPositions, CANVAS_REF_KINDS, type CanvasItemRow } from './canvas';

const item = (over: Partial<CanvasItemRow>): CanvasItemRow => ({
  id: 'i1',
  canvas_id: 'c1',
  brand_id: 'b1',
  ref_kind: 'post',
  ref_id: 'p1',
  body: null,
  x: 0,
  y: 0,
  w: 320,
  h: 320,
  z: 0,
  updated_at: '2026-09-19T10:00:00Z',
  ...over
});

describe('hydrateCanvasItems — la tela mostra gli oggetti, non una loro copia', () => {
  it('attacca a ogni tile il suo oggetto', () => {
    const out = hydrateCanvasItems([item({ ref_kind: 'post', ref_id: 'p1' })], {
      post: new Map([['p1', { id: 'p1', caption: 'ciao' }]]),
      media: new Map(),
      document: new Map(),
      memory: new Map(),
      graphic: new Map()
    });

    expect(out[0].ref).toEqual({ id: 'p1', caption: 'ciao' });
    expect(out[0].missing).toBe(false);
  });

  // Nessuna cascata dal referente: un post cancellato lascia la tile. Sparire di soppiatto da una
  // tela che qualcuno sta guardando è peggio di un riquadro che dice «questa cosa non c'è più».
  it('una tile il cui oggetto è sparito si DICHIARA invece di svanire', () => {
    const out = hydrateCanvasItems([item({ ref_id: 'fantasma' })], {
      post: new Map(),
      media: new Map(),
      document: new Map(),
      memory: new Map(),
      graphic: new Map()
    });

    expect(out).toHaveLength(1);
    expect(out[0].missing).toBe(true);
    expect(out[0].ref).toBeNull();
  });

  it('una nota porta il suo testo e non cerca nessun oggetto', () => {
    const out = hydrateCanvasItems([item({ ref_kind: 'note', ref_id: null, body: 'ricordati' })], {
      post: new Map(),
      media: new Map(),
      document: new Map(),
      memory: new Map(),
      graphic: new Map()
    });

    expect(out[0].missing).toBe(false);
    expect(out[0].body).toBe('ricordati');
  });

  it('tiene l ordine di impilamento che il database ha dato', () => {
    const out = hydrateCanvasItems(
      [
        item({ id: 'sotto', ref_id: 'p1', z: 0 }),
        item({ id: 'sopra', ref_id: 'p1', z: 5 })
      ],
      { post: new Map([['p1', { id: 'p1' }]]), media: new Map(), document: new Map(), memory: new Map(), graphic: new Map() }
    );

    expect(out.map((i) => i.id)).toEqual(['sotto', 'sopra']);
  });

  it('i tipi ammessi sono quelli del vincolo, non una lista parallela', () => {
    expect([...CANVAS_REF_KINDS]).toEqual(['post', 'media', 'document', 'memory', 'graphic', 'note']);
  });
});

describe('saveCanvasPositions — una posizione che resta dove è stata lasciata', () => {
  const ok = { brandId: 'b1', userId: 'u1', canvasId: 'c1', refKind: 'media', refId: 'm1', x: 10, y: 20, w: 300, h: 300 };

  it('rifiuta un tipo che il vincolo del database non ammette, senza tentare la scrittura', async () => {
    const upsert = vi.fn();

    const out = await saveCanvasPositions(fakeWriter(upsert) as never, { ...ok, refKind: 'inventato' });

    expect(out.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  // Coordinate non finite arrivano da un trascinamento interrotto: scriverle darebbe una tile
  // irraggiungibile, che poi nessuno può più spostare perché non si vede.
  it('rifiuta coordinate non finite', async () => {
    const upsert = vi.fn();

    const out = await saveCanvasPositions(fakeWriter(upsert) as never, { ...ok, x: Number.NaN });

    expect(out.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rifiuta una misura a zero, che il vincolo `size` boccerebbe comunque', async () => {
    const upsert = vi.fn();

    const out = await saveCanvasPositions(fakeWriter(upsert) as never, { ...ok, w: 0 });

    expect(out.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('scrive la riga con posizione e misura', async () => {
    const upsert = vi.fn(async () => ({ error: null }));

    const out = await saveCanvasPositions(fakeWriter(upsert) as never, ok);

    expect(out.ok).toBe(true);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      canvas_id: 'c1', brand_id: 'b1', ref_kind: 'media', ref_id: 'm1', x: 10, y: 20, w: 300, h: 300
    });
  });

  it('un errore del database torna come rifiuto, non come successo', async () => {
    const upsert = vi.fn(async () => ({ error: { message: 'rls' } }));

    expect((await saveCanvasPositions(fakeWriter(upsert) as never, ok)).ok).toBe(false);
  });
});

function fakeWriter(upsert: (row: unknown, opts?: unknown) => unknown) {
  return { from: () => ({ upsert }) };
}
