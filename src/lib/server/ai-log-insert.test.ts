import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ai_calls` cambiò forma (klnswzhhgrqvbfjzioul): niente più `label`/`ms`/`input_tokens`/
 * `output_tokens`/`context` — sono `operation`/`latency_ms`/`prompt_tokens`/`completion_tokens`,
 * e `context` non esiste più. `logAiCall` scriveva ancora i nomi vecchi: ogni insert falliva,
 * `console.warn` lo inghiottiva, e una generazione VERA restava senza riga — costo pagato al
 * fornitore, invisibile nel prodotto. Prova diretta: PGRST204 "Could not find the 'context'
 * column of 'ai_calls' in the schema cache", osservato due volte in produzione lo stesso giorno.
 *
 * Qui si insert-a contro un fake che accetta SOLO le colonne reali (vedi `REAL_COLUMNS`,
 * copiate da `Database['public']['Tables']['ai_calls']['Insert']` in database.types.ts): una
 * colonna sconosciuta nella riga scritta fa fallire il fake esattamente come fallirebbe
 * PostgREST, così il test non può passare finché l'insert non parla lo schema vero.
 */

const REAL_COLUMNS = new Set([
  'id', 'org_id', 'brand_id', 'project_id',
  'provider', 'model', 'operation',
  'prompt_tokens', 'completion_tokens', 'reasoning_tokens', 'cached_tokens', 'total_tokens',
  'cost_usd', 'provider_credits', 'billed_credits',
  'status', 'error', 'latency_ms',
  'actor_kind', 'actor_id', 'agent_key',
  'node_id', 'node_run_id', 'thread_id', 'post_id',
  'request_id', 'created_at'
]);

const REQUIRED_COLUMNS = ['org_id', 'provider', 'operation', 'status'];

const rows: Record<string, unknown>[] = [];
let lastError: { message: string } | null = null;

vi.mock('./supabase-admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'credit_ledger') return { insert: async () => ({ error: null }) };

      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (table !== 'ai_calls') return { data: null, error: null };

              const unknownCols = Object.keys(row).filter((k) => !REAL_COLUMNS.has(k));
              if (unknownCols.length > 0) {
                lastError = { message: `Could not find the '${unknownCols[0]}' column of 'ai_calls' in the schema cache` };
                return { data: null, error: lastError };
              }

              const missing = REQUIRED_COLUMNS.filter((k) => row[k] === undefined || row[k] === null);
              if (missing.length > 0) {
                lastError = { message: `null value in column "${missing[0]}" of relation "ai_calls" violates not-null constraint` };
                return { data: null, error: lastError };
              }

              const id = `call-${rows.length + 1}`;
              rows.push({ ...row, id });
              lastError = null;
              return { data: { id }, error: null };
            }
          })
        })
      };
    }
  })
}));

import { logAiCall, withBrandContext } from './ai-log';

async function settled(): Promise<void> {
  await vi.waitFor(() => expect(rows.length + Number(lastError !== null)).toBeGreaterThan(0));
}

beforeEach(() => {
  rows.length = 0;
  lastError = null;
});

describe('logAiCall scrive le colonne reali di ai_calls', () => {
  it('inserisce una riga con org_id, operation, status, latency_ms, prompt_tokens/completion_tokens', async () => {
    withBrandContext('brand-1', () => {
      logAiCall({
        label: 'renderImage',
        provider: 'llm',
        model: 'x',
        ms: 842,
        ok: true,
        inputTokens: 100,
        outputTokens: 50,
        orgId: 'org-1'
      });
    });

    await settled();

    expect(lastError).toBeNull();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.operation).toBe('renderImage');
    expect(row.status).toBe('ok');
    expect(row.latency_ms).toBe(842);
    expect(row.prompt_tokens).toBe(100);
    expect(row.completion_tokens).toBe(50);
    expect(row.org_id).toBe('org-1');
    expect(row.brand_id).toBe('brand-1');
    expect(row).not.toHaveProperty('label');
    expect(row).not.toHaveProperty('ms');
    expect(row).not.toHaveProperty('input_tokens');
    expect(row).not.toHaveProperty('output_tokens');
    expect(row).not.toHaveProperty('context');
  });

  it('una riga fallita scrive status: error, non ok', async () => {
    withBrandContext('brand-1', () => {
      logAiCall({ label: 'chat', provider: 'llm', ms: 5, ok: false, error: 'boom', orgId: 'org-1' });
    });

    await settled();

    expect(lastError).toBeNull();
    expect(rows[0].status).toBe('error');
    expect(rows[0].error).toBe('boom');
  });
});
