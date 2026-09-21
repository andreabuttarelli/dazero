import { describe, it, expect, vi } from 'vitest';
import { deleteCanvasItems } from './canvas-delete';

/**
 * Un finto client che registra la catena, perché la CATENA è il difetto da guardare: una `delete`
 * senza `eq('brand_id', …)` cancella righe di un altro brand e nessun test sul risultato lo vede.
 */
function client(error: { message: string } | null = null) {
  const calls: { table: string; ids: unknown; brand: unknown } = {
    table: '',
    ids: null,
    brand: null
  };

  const chain = {
    delete: vi.fn(() => chain),
    in: vi.fn((_col: string, v: unknown) => {
      calls.ids = v;
      return chain;
    }),
    eq: vi.fn((_col: string, v: unknown) => {
      calls.brand = v;
      return Promise.resolve({ error });
    })
  };

  const supabase = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return chain;
    })
  };

  return { supabase, calls, chain };
}

describe('deleteCanvasItems', () => {
  it('cancella le tile chieste, e SOLO dentro il brand', () => {
    const { supabase, calls } = client();

    return deleteCanvasItems(supabase as never, { brandId: 'b1', itemIds: ['i1', 'i2'] }).then((r) => {
      expect(r).toEqual({ ok: true, deleted: 2 });
      expect(calls.table).toBe('brand_canvas_items');
      expect(calls.ids).toEqual(['i1', 'i2']);
      // Il filtro sul brand non è cerimonia: un id di tile indovinato senza di esso cancella
      // dalla tela di qualcun altro.
      expect(calls.brand).toBe('b1');
    });
  });

  it('senza id non tocca il database', async () => {
    const { supabase } = client();
    const r = await deleteCanvasItems(supabase as never, { brandId: 'b1', itemIds: [] });

    expect(r.ok).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('senza brand non tocca il database', async () => {
    const { supabase } = client();
    const r = await deleteCanvasItems(supabase as never, { brandId: '', itemIds: ['i1'] });

    expect(r.ok).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('scarta gli id vuoti invece di passarli al database', async () => {
    const { supabase, calls } = client();
    await deleteCanvasItems(supabase as never, { brandId: 'b1', itemIds: ['i1', '', '  '] });

    expect(calls.ids).toEqual(['i1']);
  });

  it('non cancella due volte lo stesso id', async () => {
    const { supabase, calls } = client();
    const r = await deleteCanvasItems(supabase as never, { brandId: 'b1', itemIds: ['i1', 'i1'] });

    expect(calls.ids).toEqual(['i1']);
    expect(r).toEqual({ ok: true, deleted: 1 });
  });

  it('riporta l’errore del database invece di dire che è andata', async () => {
    const { supabase } = client({ message: 'permesso negato' });
    const r = await deleteCanvasItems(supabase as never, { brandId: 'b1', itemIds: ['i1'] });

    expect(r).toEqual({ ok: false, error: 'permesso negato' });
  });
});
