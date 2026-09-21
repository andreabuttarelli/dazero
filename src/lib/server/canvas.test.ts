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

  it('una pagina incorporata porta il suo indirizzo e non cerca nessun oggetto', () => {
    // Lo stesso difetto che `gen` ha già pagato: senza il suo caso, una tile che non punta a
    // niente si disegnerebbe come «questa cosa non c'è più». Qui non è sparito niente — non c'è
    // mai stata una riga a cui puntare.
    const out = hydrateCanvasItems(
      [item({ ref_kind: 'iframe', ref_id: null, url: 'https://example.com' })],
      {
        post: new Map(),
        media: new Map(),
        document: new Map(),
        memory: new Map(),
        graphic: new Map()
      }
    );

    expect(out[0].missing).toBe(false);
    expect(out[0].ref).toBeNull();
    expect(out[0].url).toBe('https://example.com');
  });

  it('una pagina incorporata che porta il suo HTML non è una tile mancante', () => {
    const out = hydrateCanvasItems(
      [item({ ref_kind: 'iframe', ref_id: null, url: null, html: '<h1>ciao</h1>' })],
      {
        post: new Map(),
        media: new Map(),
        document: new Map(),
        memory: new Map(),
        graphic: new Map()
      }
    );

    expect(out[0].missing).toBe(false);
    expect(out[0].html).toBe('<h1>ciao</h1>');
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

  it('i tipi ammessi sono quelli del vincolo, non una lista parallela', async () => {
    // Un elenco riscritto a mano qui NON prova quel che il nome promette: proverebbe che questo
    // file è d'accordo con se stesso. Il confronto è con il check che morde davvero, letto dalle
    // migrazioni — quella che lo ha creato e quelle che lo hanno riscritto, l'ultima vince.
    //
    // Si cerca il vincolo PER NOME, e non un `ref_kind in (...)` qualsiasi: `ref_shape` ne
    // contiene altri (`ref_kind in ('note', 'iframe')`), e prendendo l'ultima occorrenza del
    // file questo test finiva per confrontare i tipi della tela con i due che stanno senza
    // riferimento. Rosso quando doveva esserlo, ma per il motivo sbagliato — e verde il giorno
    // in cui quei due elenchi avessero coinciso per caso.
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    const dir = join(process.cwd(), 'supabase', 'migrations');
    const checks = readdirSync(dir)
      .sort()
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .flatMap((sql) => [
        ...sql.matchAll(/brand_canvas_items_ref_kind_check[\s\S]*?ref_kind\s+in\s+\(([^)]*)\)/gi)
      ].map((m) => m[1]));

    const last = checks.at(-1);
    const fromDatabase = [...(last ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(fromDatabase.length).toBeGreaterThan(0);
    expect([...CANVAS_REF_KINDS].sort()).toEqual(fromDatabase.sort());
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

  it('rifiuta i tipi che non puntano a niente: questa strada li identifica dal referente', async () => {
    // L'upsert va su `(canvas_id, ref_kind, ref_id)`. Un tipo che il contenuto se lo porta non ha
    // un `ref_id` con cui essere ritrovato, quindi qui non passa mai: si sposta per id di riga,
    // che è `moveCanvasItem`.
    const upsert = vi.fn();

    for (const refKind of ['note', 'iframe']) {
      const out = await saveCanvasPositions(fakeWriter(upsert) as never, { ...ok, refKind });
      expect(out.ok).toBe(false);
    }
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
