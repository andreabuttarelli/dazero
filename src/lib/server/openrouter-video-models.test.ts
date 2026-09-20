import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetVideoCatalog,
  ensureVideoCatalog,
  videoCatalogEntry,
  videoCatalogModels
} from './openrouter-video-models';

const SEEDANCE = {
  id: 'bytedance/seedance-2.5',
  name: 'Seedance 2.5',
  supported_durations: [3, 4, 5, 10, 30],
  supported_aspect_ratios: ['16:9', '9:16', '1:1'],
  supported_resolutions: ['480p', '720p'],
  supported_frame_images: ['first_frame', 'last_frame'],
  generate_audio: true,
  pricing_skus: { video_tokens: '0.0000107' }
};

const GROK = {
  id: 'x-ai/grok-imagine-video-1.5',
  name: 'Grok Imagine',
  supported_durations: [5, 10],
  supported_aspect_ratios: ['16:9', '9:16'],
  supported_resolutions: ['480p'],
  supported_frame_images: ['first_frame'],
  generate_audio: false
};

const okFetch = (models: unknown[]) =>
  (async () => ({ ok: true, json: async () => ({ data: models }) })) as unknown as typeof fetch;

beforeEach(() => __resetVideoCatalog());

describe('il catalogo video viene dal gateway, non da una lista scritta a mano', () => {
  it('porta durate, rapporti, risoluzioni e audio di ogni modello', async () => {
    await ensureVideoCatalog({ fetchImpl: okFetch([SEEDANCE, GROK]), baseUrl: 'https://x/api/v1' });

    const seedance = videoCatalogEntry('bytedance/seedance-2.5');
    expect(seedance?.durations).toEqual([3, 4, 5, 10, 30]);
    expect(seedance?.aspectRatios).toContain('9:16');
    expect(seedance?.resolutions).toEqual(['480p', '720p']);
    expect(seedance?.generatesAudio).toBe(true);
  });

  it('distingue i modelli fra loro: sono fatti del modello, non default condivisi', async () => {
    await ensureVideoCatalog({ fetchImpl: okFetch([SEEDANCE, GROK]), baseUrl: 'https://x/api/v1' });

    expect(videoCatalogEntry('x-ai/grok-imagine-video-1.5')?.generatesAudio).toBe(false);
    expect(videoCatalogEntry('x-ai/grok-imagine-video-1.5')?.durations).toEqual([5, 10]);
  });

  it('dice se un modello regge il fotogramma finale, che non tutti hanno', async () => {
    await ensureVideoCatalog({ fetchImpl: okFetch([SEEDANCE, GROK]), baseUrl: 'https://x/api/v1' });

    expect(videoCatalogEntry('bytedance/seedance-2.5')?.lastFrame).toBe(true);
    expect(videoCatalogEntry('x-ai/grok-imagine-video-1.5')?.lastFrame).toBe(false);
  });

  it('elenca i modelli per il picker, senza un secondo posto dove aggiungerne uno', async () => {
    await ensureVideoCatalog({ fetchImpl: okFetch([SEEDANCE, GROK]), baseUrl: 'https://x/api/v1' });

    expect(videoCatalogModels().map((m) => m.id)).toEqual([
      'bytedance/seedance-2.5',
      'x-ai/grok-imagine-video-1.5'
    ]);
  });

  // Un catalogo irraggiungibile non deve spegnere la generazione: chi chiama ha un ripiego, e un
  // `null` glielo lascia scegliere. Un throw qui fermerebbe un render che sarebbe potuto partire.
  it('un gateway giù lascia il catalogo vuoto invece di esplodere', async () => {
    await ensureVideoCatalog({
      fetchImpl: (async () => {
        throw new Error('rete giù');
      }) as unknown as typeof fetch,
      baseUrl: 'https://x/api/v1'
    });

    expect(videoCatalogEntry('bytedance/seedance-2.5')).toBeNull();
    expect(videoCatalogModels()).toEqual([]);
  });

  it('una risposta senza modelli non cancella quella buona di prima', async () => {
    await ensureVideoCatalog({ fetchImpl: okFetch([SEEDANCE]), baseUrl: 'https://x/api/v1' });
    await ensureVideoCatalog({ fetchImpl: okFetch([]), baseUrl: 'https://x/api/v1' });

    expect(videoCatalogEntry('bytedance/seedance-2.5')).not.toBeNull();
  });

  it('un modello che il gateway non conosce torna null, mai un default inventato', async () => {
    await ensureVideoCatalog({ fetchImpl: okFetch([SEEDANCE]), baseUrl: 'https://x/api/v1' });

    expect(videoCatalogEntry('mai/visto')).toBeNull();
  });
});
