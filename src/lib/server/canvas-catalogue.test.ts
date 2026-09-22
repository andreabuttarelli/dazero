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

import { canvasModelCatalogue } from './canvas-catalogue';

describe('i modelli che un nodo può scegliere', () => {
  beforeEach(() => vi.clearAllMocks());

  it('per il testo è la lista completa del centralino, non solo i modelli da agente', async () => {
    const out = await canvasModelCatalogue();

    expect(out.text.map((c) => c.id)).toEqual(['anthropic/claude', 'deepseek/r1', 'openai/gpt']);
  });

  it('per immagine e video vengono dal registro dei media, che porta i loro limiti', async () => {
    const out = await canvasModelCatalogue();

    expect(out.image.length).toBeGreaterThan(0);
    expect(out.video.length).toBeGreaterThan(0);
    expect(out.image[0].aspectRatios.length).toBeGreaterThan(0);
  });

  it('un modello video dichiara quanto può durare, uno immagine no', () => {
    return canvasModelCatalogue().then((out) => {
      expect(out.video.some((c) => typeof c.maxDuration === 'number')).toBe(true);
      expect(out.image.every((c) => c.maxDuration === undefined)).toBe(true);
    });
  });

  it('ogni scelta ha un id e un nome leggibile: un menù di id nudi non si sceglie', async () => {
    const out = await canvasModelCatalogue();

    for (const choices of [out.text, out.image, out.video]) {
      for (const choice of choices) {
        expect(choice.id).toBeTruthy();
        expect(choice.label).toBeTruthy();
      }
    }
  });
});
