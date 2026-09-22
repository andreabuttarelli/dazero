import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./openrouter-models', () => ({
  usableGatewayModels: () => [
    { id: 'anthropic/claude', label: 'Claude', contextLength: 200_000, usable: true }
  ],
  gatewayModels: () => [
    { id: 'anthropic/claude', label: 'Claude', contextLength: 200_000, usable: true },
    { id: 'deepseek/r1', label: 'R1', contextLength: 64_000, usable: false },
    { id: 'openai/gpt', label: 'GPT', contextLength: 400_000, usable: false }
  ],
  ensureGatewayModels: async () => {}
}));

vi.mock('./supabase-admin', () => ({ createAdminClient: () => ({}) }));

vi.mock('./offerable-models', () => ({
  offerableModels: async (_admin: unknown, medium: 'image' | 'video') =>
    medium === 'image'
      ? { synced: true, choices: [{ id: 'gpt-image-2', label: 'GPT Image 2', aspectRatios: ['1:1', '16:9'], maxRefs: 16 }] }
      : {
          synced: true,
          choices: [
            { id: 'bytedance/seedance-2-5', label: 'Seedance 2.5', aspectRatios: ['16:9', '9:16'], minDuration: 4, maxDuration: 30 }
          ]
        }
}));

import { canvasModelCatalogue } from './canvas-catalogue';

describe('i modelli che un nodo può scegliere', () => {
  beforeEach(() => vi.clearAllMocks());

  it('per il testo è la lista completa del centralino, non solo i modelli da agente', async () => {
    const out = await canvasModelCatalogue();

    expect(out.text.choices.map((c) => c.id)).toEqual(['anthropic/claude', 'deepseek/r1', 'openai/gpt']);
    expect(out.text.synced).toBe(true);
  });

  it('per immagine e video vengono da offerableModels, che porta i loro limiti', async () => {
    const out = await canvasModelCatalogue();

    expect(out.image.choices.length).toBeGreaterThan(0);
    expect(out.video.choices.length).toBeGreaterThan(0);
    expect(out.image.choices[0].aspectRatios.length).toBeGreaterThan(0);
  });

  it('un modello video dichiara quanto può durare, uno immagine no', async () => {
    const out = await canvasModelCatalogue();

    expect(out.video.choices.some((c) => typeof c.maxDuration === 'number')).toBe(true);
    expect(out.image.choices.every((c) => c.maxDuration === undefined)).toBe(true);
  });

  it('ogni scelta ha un id e un nome leggibile: un menù di id nudi non si sceglie', async () => {
    const out = await canvasModelCatalogue();

    for (const medium of [out.text, out.image, out.video]) {
      for (const choice of medium.choices) {
        expect(choice.id).toBeTruthy();
        expect(choice.label).toBeTruthy();
      }
    }
  });

  it('una ai_models vuota è leggibile: synced false, non un menù muto senza spiegazione', async () => {
    vi.doMock('./offerable-models', () => ({
      offerableModels: async () => ({ synced: false, choices: [] })
    }));
    vi.resetModules();
    const { canvasModelCatalogue: freshCatalogue } = await import('./canvas-catalogue');

    const out = await freshCatalogue();

    expect(out.image.synced).toBe(false);
    expect(out.image.choices).toEqual([]);
    expect(out.video.synced).toBe(false);
  });
});
