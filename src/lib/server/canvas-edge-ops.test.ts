import { describe, it, expect, vi } from 'vitest';
import { deleteCanvasEdge, retypeCanvasEdge } from './canvas-edge-ops';

/**
 * Il client finto tiene i filtri in un array invece di verificarli uno a uno: il difetto da
 * chiudere è «la riga sbagliata viene toccata», e per vederlo serve sapere SU COSA si è filtrato,
 * non solo che una chiamata è partita.
 */
function fakeWriter(outcome: { error: { message: string } | null } = { error: null }) {
  const eqs: Array<[string, unknown]> = [];
  const update = vi.fn();
  const del = vi.fn();

  const chain = {
    eq(column: string, value: unknown) {
      eqs.push([column, value]);
      return this;
    },
    then(resolve: (v: typeof outcome) => unknown) {
      return Promise.resolve(outcome).then(resolve);
    }
  };

  return {
    eqs,
    update,
    del,
    client: {
      from: () => ({
        update: (patch: unknown) => {
          update(patch);
          return chain;
        },
        delete: () => {
          del();
          return chain;
        }
      })
    }
  };
}

const edge = { brandId: 'b1', edgeId: 'e1' };

describe('deleteCanvasEdge — una linea si deve poter togliere', () => {
  it('cancella la riga chiesta, dentro il brand di chi chiede', async () => {
    const w = fakeWriter();

    const out = await deleteCanvasEdge(w.client as never, edge);

    expect(out.ok).toBe(true);
    expect(w.del).toHaveBeenCalled();
    expect(w.eqs).toEqual([
      ['id', 'e1'],
      ['brand_id', 'b1']
    ]);
  });

  /**
   * Il filtro sul brand non è ridondante con le RLS: sono due cancelli, e quello qui dice quale
   * riga si intende. Senza, un id di un'altra tela arriverebbe fino a Postgres come intenzione
   * valida, e il rifiuto sarebbe indistinguibile da una riga già cancellata.
   */
  it('senza id non parte niente', async () => {
    const w = fakeWriter();

    const out = await deleteCanvasEdge(w.client as never, { ...edge, edgeId: '' });

    expect(out.ok).toBe(false);
    expect(w.del).not.toHaveBeenCalled();
  });

  it('un rifiuto del database torna come motivo, non come eccezione', async () => {
    const w = fakeWriter({ error: { message: 'rls' } });

    expect(await deleteCanvasEdge(w.client as never, edge)).toEqual({ ok: false, error: 'rls' });
  });
});

describe('retypeCanvasEdge — un verso si deve poter cambiare senza rifare la linea', () => {
  it('scrive il verso nuovo sulla riga chiesta', async () => {
    const w = fakeWriter();

    const out = await retypeCanvasEdge(w.client as never, { ...edge, kind: 'responds_to' });

    expect(out.ok).toBe(true);
    expect(w.update).toHaveBeenCalledWith({ kind: 'responds_to' });
    expect(w.eqs).toEqual([
      ['id', 'e1'],
      ['brand_id', 'b1']
    ]);
  });

  /**
   * Lo stesso rifiuto di `saveCanvasEdge`, e per la stessa ragione: chi scrive è spesso un agente,
   * e un 23514 che nomina un vincolo lo fa riprovare con un'altra invenzione.
   */
  it('un verso inventato si rifiuta nominando i tre ammessi', async () => {
    const w = fakeWriter();

    const out = await retypeCanvasEdge(w.client as never, { ...edge, kind: 'ispirato_a' });

    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain('derives_from');
    expect(w.update).not.toHaveBeenCalled();
  });
});
