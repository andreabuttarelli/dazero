import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncAiModels, modalitiesOf } from './ai-models-sync';

const MODELS = {
  data: [
    {
      id: 'bytedance/seedance-2-5',
      name: 'Seedance 2.5',
      supported_parameters: ['tools'],
      architecture: { input_modalities: ['text', 'image', 'video', 'audio'], output_modalities: ['video'] },
      pricing: { prompt: '0.000005' }
    },
    { id: 'someone/text-only', name: 'Text only', architecture: { input_modalities: ['text'], output_modalities: ['text'] } }
  ]
};

function fetchImpl(body: unknown = MODELS, status = 200) {
  return (async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;
}

function fakeAdmin(existing: Record<string, unknown>[] = []) {
  const upserts: unknown[] = [];
  const admin = {
    from: (table: string) => ({
      upsert: (rows: unknown[]) => {
        upserts.push(...rows);
        return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) };
      },
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => ({ data: existing.find((r) => r.id === value) ?? null, error: null })
        })
      })
    })
  } as unknown as SupabaseClient;
  return { admin, upserts };
}

describe('syncAiModels — dal gateway alla tabella', () => {
  it('scrive una riga per modello con le sue modalità', async () => {
    const { admin, upserts } = fakeAdmin();

    const out = await syncAiModels(admin, { fetchImpl: fetchImpl(), baseUrl: 'https://openrouter.ai/api/v1' });

    expect(out).toEqual({ ok: true, synced: 2 });
    expect(upserts).toContainEqual(
      expect.objectContaining({
        id: 'bytedance/seedance-2-5',
        input_modalities: ['text', 'image', 'video', 'audio'],
        output_modalities: ['video']
      })
    );
  });

  it('senza LLM_BASE_URL non scrive niente, e dice perché', async () => {
    const { admin } = fakeAdmin();

    const out = await syncAiModels(admin, { fetchImpl: fetchImpl(), baseUrl: '' });

    expect(out).toEqual({ ok: false, reason: expect.stringContaining('LLM_BASE_URL') });
  });

  it('un gateway che risponde male non scrive niente, e dice il codice', async () => {
    const { admin } = fakeAdmin();

    const out = await syncAiModels(admin, { fetchImpl: fetchImpl({}, 500), baseUrl: 'https://openrouter.ai/api/v1' });

    expect(out).toEqual({ ok: false, reason: expect.stringContaining('500') });
  });
});

describe('modalitiesOf — cosa sa un modello, dalla tabella', () => {
  it('torna le modalità sincronizzate', async () => {
    const { admin } = fakeAdmin([
      { id: 'bytedance/seedance-2-5', input_modalities: ['text', 'image'], output_modalities: ['video'], synced_at: '2026-09-22T00:00:00Z' }
    ]);

    expect(await modalitiesOf(admin, 'bytedance/seedance-2-5')).toEqual({
      input: ['text', 'image'],
      output: ['video'],
      synced_at: '2026-09-22T00:00:00Z'
    });
  });

  it('un modello non ancora sincronizzato torna null, non "accetta tutto" né "rifiuta tutto"', async () => {
    const { admin } = fakeAdmin([]);

    expect(await modalitiesOf(admin, 'someone/brand-new-model')).toBeNull();
  });
});
