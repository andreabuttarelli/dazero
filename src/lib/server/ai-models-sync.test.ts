import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncAiModels, modalitiesOf, wireModelId, chatInputModalities } from './ai-models-sync';
import { GPT_IMAGE_25_FLARE_MODEL } from '$lib/image-models';
import { SEEDANCE_25_MODEL } from '$lib/video-models';

const CHAT_MODELS = {
  data: [
    {
      id: 'bytedance/seedance-2-5',
      name: 'Seedance 2.5',
      supported_parameters: ['tools'],
      architecture: { input_modalities: ['text', 'image', 'video', 'audio'], output_modalities: ['video'] },
      pricing: { prompt: '0.000005' }
    },
    { id: 'someone/text-only', name: 'Text only', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
    // Stesso id di una riga immagine sotto: due fatti diversi sullo stesso id, e il catalogo li
    // deve tenere distinti invece che farli sovrascrivere a vicenda.
    { id: 'google/gemini-3-pro-image', name: 'Gemini 3 Pro (chat)', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } }
  ]
};

const IMAGE_MODELS = {
  data: [
    {
      id: 'openai/gpt-image-2.5-sunburst',
      name: 'OpenAI: GPT Image 2.5 Sunburst',
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
      supported_parameters: { aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] }, input_references: { type: 'range', min: 0, max: 16 } }
    },
    {
      id: 'google/gemini-3-pro-image',
      name: 'Google: Nano Banana Pro (image)',
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
      supported_parameters: {
        input_references: { type: 'range', min: 0, max: 8 },
        resolution: { type: 'enum', values: ['1K', '2K', '4K'] }
      }
    },
    {
      id: 'bytedance-seed/seedream-5-0-lite',
      name: 'ByteDance Seed: Seedream 5.0 Lite',
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
      supported_parameters: { resolution: { type: 'enum', values: ['2K', '4K'] } }
    }
  ]
};

const VIDEO_MODELS = {
  data: [
    {
      id: 'bytedance/seedance-2.5',
      name: 'ByteDance: Seedance 2.5',
      supported_durations: [4, 5, 30],
      supported_aspect_ratios: ['16:9', '9:16'],
      supported_frame_images: ['first_frame', 'last_frame'],
      supported_resolutions: ['480p', '720p'],
      generate_audio: true,
      seed: true,
      pricing_skus: { video_tokens: '0.0000107' }
    },
    {
      id: 'x-ai/grok-imagine-video-1.5',
      name: 'Grok Imagine',
      supported_durations: [5, 15],
      supported_aspect_ratios: ['16:9'],
      supported_frame_images: ['first_frame'],
      supported_resolutions: ['480p', '720p', '1080p'],
      generate_audio: false
    },
    {
      id: 'alibaba/happyhorse-1.0',
      name: 'Alibaba: HappyHorse 1.0',
      supported_durations: [3, 15],
      supported_aspect_ratios: ['16:9'],
      supported_frame_images: ['first_frame'],
      supported_resolutions: ['720p', '1080p'],
      generate_audio: false
    }
  ]
};

function fetchImplFor(byPath: Record<string, { body: unknown; status?: number }>) {
  // Le tre rotte condividono la coda `/models`: si sceglie la corrispondenza più lunga, o
  // `/images/models` risponderebbe anche a chi ha chiesto `/models`.
  const paths = Object.keys(byPath).sort((a, b) => b.length - a.length);
  return (async (url: string) => {
    const path = paths.find((p) => url.endsWith(p));
    const entry = path ? byPath[path] : { body: { data: [] }, status: 404 };
    const status = entry.status ?? 200;
    return { ok: status < 300, status, json: async () => entry.body };
  }) as unknown as typeof fetch;
}

const okAllThree = () =>
  fetchImplFor({
    '/models': { body: CHAT_MODELS },
    '/images/models': { body: IMAGE_MODELS },
    '/videos/models': { body: VIDEO_MODELS }
  });

function fakeAdmin(existing: Record<string, unknown>[] = []) {
  const upserts: unknown[] = [];
  const admin = {
    from: (table: string) => ({
      upsert: (rows: unknown[]) => {
        upserts.push(...rows);
        return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) };
      },
      select: () => ({
        eq: (col: string, value: string) => {
          const filtered = existing.filter((r) => r[col] === value);
          return {
            eq: (col2: string, value2: string) => ({
              maybeSingle: async () => ({
                data: filtered.find((r) => r[col2] === value2) ?? null,
                error: null
              })
            }),
            maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
            then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) =>
              resolve({ data: filtered, error: null })
          };
        }
      })
    })
  } as unknown as SupabaseClient;
  return { admin, upserts };
}

describe('syncAiModels — dai tre listini del gateway alla tabella', () => {
  it('scrive una riga per modello di ognuno dei tre listini, con la modalità giusta', async () => {
    const { admin, upserts } = fakeAdmin();

    const out = await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    expect(out).toEqual({ ok: true, synced: 9 });
    expect(upserts).toContainEqual(
      expect.objectContaining({
        id: 'bytedance/seedance-2-5',
        catalogue: 'chat',
        input_modalities: ['text', 'image', 'video', 'audio'],
        output_modalities: ['video']
      })
    );
    expect(upserts).toContainEqual(
      expect.objectContaining({
        id: 'openai/gpt-image-2.5-sunburst',
        catalogue: 'image',
        input_modalities: ['text', 'image'],
        output_modalities: ['image']
      })
    );
  });

  it('un modello video non dichiara architecture: le modalità si ricavano dai suoi campi', async () => {
    const { admin, upserts } = fakeAdmin();

    await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    const seedance = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'bytedance/seedance-2.5' && (r as Record<string, unknown>).catalogue === 'video'
    ) as Record<string, unknown>;
    expect(seedance.output_modalities).toEqual(['video']);
    // first_frame + last_frame → accetta un'immagine in ingresso; generate_audio: true → audio.
    expect(seedance.input_modalities).toEqual(expect.arrayContaining(['text', 'image', 'audio']));

    const grok = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'x-ai/grok-imagine-video-1.5' && (r as Record<string, unknown>).catalogue === 'video'
    ) as Record<string, unknown>;
    // Solo first_frame, generate_audio: false → niente audio in ingresso.
    expect(grok.input_modalities).toEqual(expect.arrayContaining(['text', 'image']));
    expect(grok.input_modalities).not.toContain('audio');
  });

  it('un modello video sincronizzato porta le sue risoluzioni vere, non un elenco condiviso', async () => {
    const { admin, upserts } = fakeAdmin();

    await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    const happyhorse = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'alibaba/happyhorse-1.0' && (r as Record<string, unknown>).catalogue === 'video'
    ) as Record<string, unknown>;
    expect(happyhorse.supported_resolutions).toEqual(['720p', '1080p']);

    const seedance = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'bytedance/seedance-2.5' && (r as Record<string, unknown>).catalogue === 'video'
    ) as Record<string, unknown>;
    expect(seedance.supported_resolutions).toEqual(['480p', '720p']);
  });

  it('un modello immagine sincronizzato porta i valori di "resolution", diversi da modello a modello', async () => {
    const { admin, upserts } = fakeAdmin();

    await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    const nanoBananaPro = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'google/gemini-3-pro-image' && (r as Record<string, unknown>).catalogue === 'image'
    ) as Record<string, unknown>;
    expect(nanoBananaPro.supported_resolutions).toEqual(['1K', '2K', '4K']);

    const seedreamLite = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'bytedance-seed/seedream-5-0-lite' && (r as Record<string, unknown>).catalogue === 'image'
    ) as Record<string, unknown>;
    expect(seedreamLite.supported_resolutions).toEqual(['2K', '4K']);
    expect(seedreamLite.supported_resolutions).not.toContain('1K');
  });

  it('un modello immagine senza "resolution" (i GPT Image, che usano "quality") non porta nessuna risoluzione', async () => {
    const { admin, upserts } = fakeAdmin();

    await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    const sunburst = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'openai/gpt-image-2.5-sunburst' && (r as Record<string, unknown>).catalogue === 'image'
    ) as Record<string, unknown>;
    expect(sunburst.supported_resolutions).toEqual([]);
  });

  it('un modello immagine porta lo schema intero di ogni parametro dichiarato, non solo i nomi', async () => {
    const { admin, upserts } = fakeAdmin();

    await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    const nanoBananaPro = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'google/gemini-3-pro-image' && (r as Record<string, unknown>).catalogue === 'image'
    ) as Record<string, unknown>;
    expect(nanoBananaPro.param_schema).toEqual({
      input_references: { type: 'range', min: 0, max: 8 },
      resolution: { type: 'enum', values: ['1K', '2K', '4K'] }
    });
  });

  it('un modello di chat non porta param_schema', async () => {
    const { admin, upserts } = fakeAdmin();

    await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    const chatSeedance = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'bytedance/seedance-2-5' && (r as Record<string, unknown>).catalogue === 'chat'
    ) as Record<string, unknown>;
    expect(chatSeedance.param_schema).toEqual({});
  });

  it('un modello video porta generate_audio/seed nello schema solo quando li dichiara', async () => {
    const { admin, upserts } = fakeAdmin();

    await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    const seedance = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'bytedance/seedance-2.5' && (r as Record<string, unknown>).catalogue === 'video'
    ) as Record<string, unknown>;
    expect(seedance.param_schema).toEqual({ generate_audio: { type: 'boolean' }, seed: { type: 'boolean' } });

    const grok = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'x-ai/grok-imagine-video-1.5' && (r as Record<string, unknown>).catalogue === 'video'
    ) as Record<string, unknown>;
    expect(grok.param_schema).toEqual({ generate_audio: { type: 'boolean' } });
  });

  it('quando la colonna param_schema non esiste ancora, riprova senza e scrive comunque', async () => {
    const upserts: unknown[] = [];
    let firstAttempt = true;
    const admin = {
      from: () => ({
        upsert: (rows: unknown[]) => {
          if (firstAttempt) {
            firstAttempt = false;
            return {
              then: (resolve: (v: { error: { message: string } }) => unknown) =>
                resolve({ error: { message: 'column "param_schema" of relation "ai_models" does not exist' } })
            };
          }
          upserts.push(...rows);
          return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) };
        }
      })
    } as unknown as SupabaseClient;

    const out = await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    expect(out).toEqual({ ok: true, synced: 9 });
    expect(upserts.length).toBe(9);
    expect((upserts[0] as Record<string, unknown>).param_schema).toBeUndefined();
  });

  it('lo stesso id su due listini resta due righe distinte, non una che sovrascrive l’altra', async () => {
    const { admin, upserts } = fakeAdmin();

    await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: 'https://openrouter.ai/api/v1' });

    const chatRow = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'google/gemini-3-pro-image' && (r as Record<string, unknown>).catalogue === 'chat'
    ) as Record<string, unknown>;
    const imageRow = upserts.find(
      (r) => (r as Record<string, unknown>).id === 'google/gemini-3-pro-image' && (r as Record<string, unknown>).catalogue === 'image'
    ) as Record<string, unknown>;

    expect(chatRow.output_modalities).toEqual(['text']);
    expect(imageRow.output_modalities).toEqual(['image']);
  });

  it('un listino irraggiungibile non blocca gli altri due', async () => {
    const { admin, upserts } = fakeAdmin();
    const fetchImpl = fetchImplFor({
      '/models': { body: CHAT_MODELS },
      '/images/models': { body: {}, status: 500 },
      '/videos/models': { body: VIDEO_MODELS }
    });

    const out = await syncAiModels(admin, { fetchImpl, baseUrl: 'https://openrouter.ai/api/v1' });

    expect(out.ok).toBe(true);
    expect(upserts.some((r) => (r as Record<string, unknown>).catalogue === 'chat')).toBe(true);
    expect(upserts.some((r) => (r as Record<string, unknown>).catalogue === 'video')).toBe(true);
    expect(upserts.some((r) => (r as Record<string, unknown>).catalogue === 'image')).toBe(false);
  });

  it('senza LLM_BASE_URL non scrive niente, e dice perché', async () => {
    const { admin } = fakeAdmin();

    const out = await syncAiModels(admin, { fetchImpl: okAllThree(), baseUrl: '' });

    expect(out).toEqual({ ok: false, reason: expect.stringContaining('LLM_BASE_URL') });
  });

  it('tre listini irraggiungibili non scrivono niente, e dicono perché', async () => {
    const { admin } = fakeAdmin();
    const fetchImpl = fetchImplFor({
      '/models': { body: {}, status: 500 },
      '/images/models': { body: {}, status: 500 },
      '/videos/models': { body: {}, status: 500 }
    });

    const out = await syncAiModels(admin, { fetchImpl, baseUrl: 'https://openrouter.ai/api/v1' });

    expect(out.ok).toBe(false);
  });
});

describe('modalitiesOf — cosa sa un modello, dalla tabella, per il listino giusto', () => {
  it('torna le modalità sincronizzate per il catalogo richiesto', async () => {
    const { admin } = fakeAdmin([
      { id: 'bytedance/seedance-2-5', catalogue: 'chat', input_modalities: ['text', 'image'], output_modalities: ['video'], synced_at: '2026-09-22T00:00:00Z' }
    ]);

    expect(await modalitiesOf(admin, 'bytedance/seedance-2-5', 'chat')).toEqual({
      input: ['text', 'image'],
      output: ['video'],
      synced_at: '2026-09-22T00:00:00Z'
    });
  });

  it('un modello non ancora sincronizzato per QUEL listino torna null', async () => {
    const { admin } = fakeAdmin([]);

    expect(await modalitiesOf(admin, 'someone/brand-new-model', 'chat')).toBeNull();
  });

  it('lo stesso id su un altro listino non risponde per il listino sbagliato', async () => {
    const { admin } = fakeAdmin([
      { id: 'google/gemini-3-pro-image', catalogue: 'chat', input_modalities: ['text'], output_modalities: ['text'], synced_at: '2026-09-22T00:00:00Z' }
    ]);

    expect(await modalitiesOf(admin, 'google/gemini-3-pro-image', 'image')).toBeNull();
  });

  it('senza dire il listino, cerca sui tre e torna il primo che risponde — il ripiego di un chiamante che non conosce ancora il medium del nodo', async () => {
    const { admin } = fakeAdmin([
      { id: 'bytedance/seedance-2-5', catalogue: 'video', input_modalities: ['text', 'image'], output_modalities: ['video'], synced_at: '2026-09-22T00:00:00Z' }
    ]);

    expect(await modalitiesOf(admin, 'bytedance/seedance-2-5')).toEqual({
      input: ['text', 'image'],
      output: ['video'],
      synced_at: '2026-09-22T00:00:00Z'
    });
  });

  it('con un catalogo, traduce il nostro id interno all\'id sul filo prima di cercare — la regressione vera: `ai_models.id` è sempre il wire id, mai il nostro', async () => {
    const { admin } = fakeAdmin([
      {
        id: 'openai/gpt-image-2.5-flare',
        catalogue: 'image',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        synced_at: '2026-09-22T00:00:00Z'
      }
    ]);

    // `GPT_IMAGE_25_FLARE_MODEL` è il nostro id interno ('gpt-image-2.5-flare'), non quello che
    // la tabella ha scritto ('openai/gpt-image-2.5-flare'): senza la traduzione questa query non
    // trova mai la riga, ed è esattamente il blocco totale che si è visto in produzione.
    expect(await modalitiesOf(admin, GPT_IMAGE_25_FLARE_MODEL, 'image')).toEqual({
      input: ['text', 'image'],
      output: ['image'],
      synced_at: '2026-09-22T00:00:00Z'
    });
  });

  it('un id interno genuinamente sconosciuto al medium resta bloccato — la traduzione non allarga il permesso', async () => {
    const { admin } = fakeAdmin([
      { id: 'openai/gpt-image-2.5-flare', catalogue: 'image', input_modalities: ['text', 'image'], output_modalities: ['image'], synced_at: 'now' }
    ]);

    expect(await modalitiesOf(admin, 'not-a-real-model', 'image')).toBeNull();
  });
});

describe('chatInputModalities — le modalità di ogni modello di chat, in un giro solo', () => {
  it('una riga per id sincronizzato sul listino chat', async () => {
    const { admin } = fakeAdmin([
      { id: 'anthropic/claude-haiku-4.5', catalogue: 'chat', input_modalities: ['text', 'image'] },
      { id: 'deepseek/r1', catalogue: 'chat', input_modalities: ['text'] },
      { id: 'openai/gpt-image-2.5-flare', catalogue: 'image', input_modalities: ['text', 'image'] }
    ]);

    const out = await chatInputModalities(admin);

    expect(out.get('anthropic/claude-haiku-4.5')).toEqual(['text', 'image']);
    expect(out.get('deepseek/r1')).toEqual(['text']);
    expect(out.has('openai/gpt-image-2.5-flare')).toBe(false);
  });

  it('un listino chat vuoto torna una mappa vuota, non un errore', async () => {
    const { admin } = fakeAdmin([]);

    expect((await chatInputModalities(admin)).size).toBe(0);
  });
});

describe('wireModelId — il nostro id interno, sul filo di OpenRouter', () => {
  it('un id immagine si traduce tramite `openrouterImages`', async () => {
    expect(await wireModelId(GPT_IMAGE_25_FLARE_MODEL, 'image')).toBe('openai/gpt-image-2.5-flare');
  });

  it('un id video si traduce tramite `openrouterId`', async () => {
    expect(await wireModelId(SEEDANCE_25_MODEL, 'video')).toBe('bytedance/seedance-2.5');
  });

  it('un id di chat non si traduce: è già quello sul filo', async () => {
    expect(await wireModelId('anthropic/claude-opus', 'chat')).toBe('anthropic/claude-opus');
  });

  it('un id senza spec per quel medium resta così com\'è — genuinamente sconosciuto, non da tradurre', async () => {
    expect(await wireModelId('not-a-real-model', 'image')).toBe('not-a-real-model');
  });
});
