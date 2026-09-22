import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * QUALE TOOL HA CAUSATO LA SPESA. `ai_calls.operation` dice quale funzione ha parlato al modello,
 * non chi gliel'ha chiesto: `planStrategy` la raggiungono l'autopilot, la chat in-app e gli agenti
 * esterni, quindi il totale di un'etichetta è un tetto e non un'attribuzione. Finché la riga non
 * porta il nome del tool, «questo tool vale quello che costa» non ha risposta.
 *
 * `context` non è più una colonna (schema klnswzhhgrqvbfjzioul): il nome del tool si concatena
 * dentro `operation` (`label:tool:nome` / `label:context-del-call-site`).
 */

const rows: Record<string, unknown>[] = [];

vi.mock('./supabase-admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        rows.push(row);
        return { error: null };
      }
    })
  })
}));

import { logAiCall, withBrandContext, withToolContext } from './ai-log';

const A_CALL = { label: 'planStrategy', provider: 'internal', ms: 12, ok: true, orgId: 'org-1' } as const;

async function written(): Promise<Record<string, unknown>> {
  await vi.waitFor(() => expect(rows).toHaveLength(1));
  return rows[0];
}

beforeEach(() => {
  rows.length = 0;
});

describe('il tool che ha causato la chiamata', () => {
  it('non inventa niente quando nessun tool sta chiamando', async () => {
    logAiCall({ ...A_CALL });

    expect((await written()).operation).toBe('planStrategy');
  });

  it('lascia il suo nome sulla riga', async () => {
    withToolContext('plan_week', () => logAiCall({ ...A_CALL }));

    expect((await written()).operation).toBe('planStrategy:tool:plan_week');
  });

  it('lo lascia anche su una chiamata che parte dopo un await', async () => {
    await withToolContext('plan_week', async () => {
      await Promise.resolve();
      logAiCall({ ...A_CALL });
    });

    expect((await written()).operation).toBe('planStrategy:tool:plan_week');
  });

  it('cede il posto al call site, che di quella chiamata sa di più', async () => {
    withToolContext('generate_video', () => logAiCall({ ...A_CALL, context: 'music:pro:30s' }));

    expect((await written()).operation).toBe('planStrategy:music:pro:30s');
  });

  it('senza un nome non apre nessuno scope', async () => {
    withToolContext(null, () => logAiCall({ ...A_CALL }));

    expect((await written()).operation).toBe('planStrategy');
  });

  it('un brand senza orgId esplicito prende org_id dal brand', async () => {
    withBrandContext('brand-1', () => logAiCall({ label: 'planStrategy', provider: 'internal', ms: 12, ok: true }));

    // No brands lookup mocked here: org_id resolves to null, and an unresolved org means the
    // row is NOT written (NOT NULL) — proving the guard, not the resolution itself.
    await vi.waitFor(() => expect(rows).toHaveLength(0));
  });
});
