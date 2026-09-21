import { describe, it, expect, vi } from 'vitest';
import { recordGenRun, loadGenRuns, showGenRun } from './canvas-run';

/**
 * Il client di Supabase, ridotto a quel che queste funzioni toccano. Le catene sono quelle vere —
 * `insert().select().maybeSingle()` e `update().eq().eq()` — perché è il loro ordine che questi
 * test devono poter vedere sbagliare.
 */
function writer(over: { run?: unknown; runError?: unknown; itemError?: unknown; rows?: unknown[] } = {}) {
  const runRow = over.run ?? { id: 'run-1', media_id: 'media-1', prompt: 'un gatto', model: 'm1', params: {}, created_at: '2026-09-21T10:00:00Z' };

  const maybeSingle = vi.fn().mockResolvedValue({ data: runRow, error: over.runError ?? null });
  const insertSelect = vi.fn(() => ({ maybeSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  const updateBrand = vi.fn().mockResolvedValue({ error: over.itemError ?? null });
  const updateItem = vi.fn(() => ({ eq: updateBrand }));
  const update = vi.fn(() => ({ eq: updateItem }));

  const order = vi.fn().mockResolvedValue({ data: over.rows ?? [], error: null });
  const listIn = vi.fn(() => ({ order }));
  const listSelect = vi.fn(() => ({ in: listIn }));

  const client = {
    from: vi.fn((table: string) =>
      table === 'brand_canvas_item_runs' ? { insert, select: listSelect } : { update }
    )
  } as never;

  return { client, insert, update, updateItem, updateBrand, listIn, order };
}

const input = {
  brandId: 'b1',
  userId: 'u1',
  itemId: 'i1',
  mediaId: 'media-1',
  prompt: 'un gatto',
  model: 'm1',
  params: { aspectRatio: '1:1' }
};

describe('registrare una generazione', () => {
  it('scrive la riga della storia PRIMA di spostare quel che si vede', async () => {
    // L'ordine è il punto: se `ref_id` si spostasse per primo e la riga di storia fallisse, la
    // generazione di prima sarebbe irrecuperabile — che è esattamente il difetto da chiudere.
    const { client, insert, update } = writer();

    await recordGenRun(client, input);

    expect(insert.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
  });

  it('restituisce l esecuzione appena scritta, con il suo id', async () => {
    const { client } = writer();

    const saved = await recordGenRun(client, input);

    expect(saved).toEqual({
      ok: true,
      run: { id: 'run-1', mediaId: 'media-1', prompt: 'un gatto', model: 'm1', createdAt: '2026-09-21T10:00:00Z' }
    });
  });

  it('sposta quel che si vede sull asset nuovo', async () => {
    const { client, update } = writer();

    await recordGenRun(client, input);

    expect(update).toHaveBeenCalledWith({ ref_id: 'media-1' });
  });

  it('senza asset non registra niente: un clip che deve ancora atterrare non è una generazione da rivedere', async () => {
    const { client, insert, update } = writer();

    const saved = await recordGenRun(client, { ...input, mediaId: null });

    expect(saved).toEqual({ ok: false, error: 'nessun asset da registrare' });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('un item_id vuoto si rifiuta qui invece di scrivere una riga orfana', async () => {
    const { client, insert } = writer();

    expect(await recordGenRun(client, { ...input, itemId: '' })).toEqual({
      ok: false,
      error: 'item_id è obbligatorio'
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('tornare a una generazione di prima', () => {
  it('sposta `ref_id` su un asset che quel nodo ha DAVVERO prodotto', async () => {
    const { client, update } = writer({ rows: [{ id: 'run-1', item_id: 'i1', media_id: 'media-1', prompt: 'p', model: 'm', params: {}, created_at: 'ora' }] });

    const done = await showGenRun(client, { brandId: 'b1', itemId: 'i1', runId: 'run-1' });

    expect(done).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ ref_id: 'media-1' });
  });

  it('un run di un altro nodo non sposta niente', async () => {
    // Senza questo controllo un id indovinato appenderebbe l asset di un altro nodo a questo, e
    // la tela mostrerebbe una cosa che quel nodo non ha mai fatto.
    const { client, update } = writer({ rows: [] });

    const done = await showGenRun(client, { brandId: 'b1', itemId: 'i1', runId: 'run-di-un-altro' });

    expect(done).toEqual({ ok: false, error: 'esecuzione non trovata' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('leggere la storia di una tela', () => {
  it('la chiede per tutti i nodi in un giro solo, non uno per nodo', async () => {
    const { client, listIn } = writer({ rows: [] });

    await loadGenRuns(client, ['i1', 'i2']);

    expect(listIn).toHaveBeenCalledWith('item_id', ['i1', 'i2']);
  });

  it('senza nodi non interroga affatto', async () => {
    const { client, listIn } = writer();

    expect(await loadGenRuns(client, [])).toEqual({});
    expect(listIn).not.toHaveBeenCalled();
  });

  it('raggruppa per nodo, nell ordine in cui sono state fatte', async () => {
    const { client } = writer({
      rows: [
        { id: 'r1', item_id: 'i1', media_id: 'm1', prompt: 'p1', model: 'x', params: {}, created_at: '2026-09-21T10:00:00Z' },
        { id: 'r2', item_id: 'i1', media_id: 'm2', prompt: 'p2', model: 'x', params: {}, created_at: '2026-09-21T11:00:00Z' },
        { id: 'r3', item_id: 'i2', media_id: 'm3', prompt: 'p3', model: 'y', params: {}, created_at: '2026-09-21T12:00:00Z' }
      ]
    });

    const byItem = await loadGenRuns(client, ['i1', 'i2']);

    expect(byItem.i1.map((r) => r.mediaId)).toEqual(['m1', 'm2']);
    expect(byItem.i2.map((r) => r.mediaId)).toEqual(['m3']);
  });
});
