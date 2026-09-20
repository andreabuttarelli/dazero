import { describe, it, expect, vi } from 'vitest';
import { BRAND_AGENT_SURFACE, openBrandThread } from './thread';

type Row = Record<string, unknown>;

/**
 * Un client Supabase ridotto a quello che questo modulo usa davvero. Non un mock del database:
 * un registratore di cosa è stato chiesto, che è l'unica cosa che il test deve poter affermare.
 */
function fakeDb(existing: Row | null) {
  const inserted: Row[] = [];
  const filters: Row = {};

  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (row: Row) => {
      inserted.push(row);
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve({ data: existing, error: null }),
    single: () => Promise.resolve({ data: { id: 'new-thread' }, error: null })
  };

  return { from: () => builder, inserted, filters };
}

describe('openBrandThread — un thread per brand, ritrovato al reload', () => {
  /**
   * IL COMPORTAMENTO CHE L'UTENTE VEDE: entri, ricarichi, sei nella stessa conversazione. Se
   * questo test cade, ogni reload apre un thread nuovo e la chat perde la memoria davanti
   * all'utente — il difetto più silenzioso possibile, perché nulla va in errore.
   */
  it('riapre il thread esistente invece di crearne un altro', async () => {
    const db = fakeDb({ id: 'existing-thread' });
    const id = await openBrandThread(db as never, 'brand-1', 'user-1');

    expect(id).toBe('existing-thread');
    expect(db.inserted).toHaveLength(0);
  });

  it('ne crea uno solo la prima volta', async () => {
    const db = fakeDb(null);
    const id = await openBrandThread(db as never, 'brand-1', 'user-1');

    expect(id).toBe('new-thread');
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      brand_id: 'brand-1',
      user_id: 'user-1',
      surface: BRAND_AGENT_SURFACE
    });
  });

  /**
   * Il thread è dell'utente DENTRO il brand: due persone dello stesso brand non si leggono la
   * conversazione a vicenda. La RLS lo impone comunque, ma un filtro mancante qui restituirebbe
   * il thread di un collega prima ancora che la RLS entri in gioco.
   */
  it('cerca per brand E per utente, non solo per brand', async () => {
    const db = fakeDb({ id: 't' });
    await openBrandThread(db as never, 'brand-1', 'user-1');

    expect(db.filters.brand_id).toBe('brand-1');
    expect(db.filters.user_id).toBe('user-1');
    expect(db.filters.surface).toBe(BRAND_AGENT_SURFACE);
  });
});
