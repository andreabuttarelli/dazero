import { describe, it, expect, vi } from 'vitest';
import { applyPostEdits } from './post-editing';

/**
 * LA SOVRASCRITTURA SILENZIOSA, quella che la migrazione 0224 descrive e che nessuno impediva.
 *
 * La colonna `updated_at` e il suo trigger esistono da allora, e la loro intestazione dice perché:
 * «una patch sovrascriveva in silenzio il lavoro di chi nel frattempo aveva modificato il post
 * (persona sul browser, altro agente, autopilot)». Ma nessun codice li usava come precondizione:
 * `edit_post` non ha un campo di versione, e l'update filtra sul solo id.
 *
 * Il fake registra i filtri applicati all'update, che è l'unico posto dove la differenza si vede.
 */
type Filter = { column: string; value: unknown };

function fakeSupabase(opts: { rows?: number; row?: Record<string, unknown> } = {}) {
  const filters: Filter[] = [];
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: opts.row ?? null }) };
            }
          };
        },
        update() {
          const chain = {
            eq(column: string, value: unknown) {
              filters.push({ column, value });
              return chain;
            },
            select() {
              return {
                // Zero righe toccate = qualcuno ha scritto prima di noi.
                then: (resolve: (v: unknown) => void) =>
                  resolve({ data: opts.rows === 0 ? [] : [{ id: 'p1' }], error: null })
              };
            },
            then: (resolve: (v: unknown) => void) => resolve({ error: null })
          };
          return chain;
        }
      };
    }
  };
  return { client, filters };
}

describe('applyPostEdits — una modifica non calpesta quella di un altro', () => {
  it('senza precondizione scrive sul solo id, come ha sempre fatto', async () => {
    const { client, filters } = fakeSupabase();

    await applyPostEdits(client as never, 'p1', { caption: 'nuova' });

    expect(filters).toEqual([{ column: 'id', value: 'p1' }]);
  });

  it('con `expectedUpdatedAt` filtra ANCHE sulla versione che il chiamante ha letto', async () => {
    const { client, filters } = fakeSupabase();

    await applyPostEdits(client as never, 'p1', { caption: 'nuova' }, {
      expectedUpdatedAt: '2026-09-19T10:00:00Z'
    });

    expect(filters).toContainEqual({ column: 'updated_at', value: '2026-09-19T10:00:00Z' });
  });

  it('se nel frattempo qualcuno ha scritto, il conflitto si VEDE invece di passare', async () => {
    const { client } = fakeSupabase({ rows: 0 });

    const result = await applyPostEdits(client as never, 'p1', { caption: 'nuova' }, {
      expectedUpdatedAt: '2026-09-19T10:00:00Z'
    });

    expect(result.error?.message).toMatch(/modificat|conflict/i);
  });

  it('quando la riga è ancora quella letta, la scrittura passa', async () => {
    const { client } = fakeSupabase({ rows: 1 });

    const result = await applyPostEdits(client as never, 'p1', { caption: 'nuova' }, {
      expectedUpdatedAt: '2026-09-19T10:00:00Z'
    });

    expect(result.error).toBeFalsy();
  });
});
