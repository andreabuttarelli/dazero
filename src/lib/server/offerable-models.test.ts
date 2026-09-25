import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GPT_IMAGE_2_MODEL, NANO_BANANA_PRO_MODEL, QWEN3_PRO_MODEL } from '$lib/image-models';
import { SEEDANCE_25_MODEL, OPENROUTER_UPSCALE_MODEL, KLING_3_VIDEO_MODEL } from '$lib/video-models';
import { mediaModelSlot } from '$lib/media-model-slots';
import { offerableModels, offerableSlotChoices } from './offerable-models';

function fakeAdmin(
  rows: {
    id: string;
    catalogue: string;
    input_modalities: string[];
    output_modalities: string[];
    supported_parameters?: string[];
    supported_resolutions?: string[];
    param_schema?: Record<string, unknown>;
  }[]
) {
  const admin = {
    from: () => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: rows.filter((r) => r.catalogue === value), error: null })
        })
      })
    })
  } as unknown as SupabaseClient;
  return admin;
}

describe('offerableModels — cosa un nodo può davvero scegliere', () => {
  it('un modello sincronizzato CON i nostri fatti di integrazione è offerto', async () => {
    const admin = fakeAdmin([
      { id: 'openai/gpt-image-2', catalogue: 'image', input_modalities: ['text', 'image'], output_modalities: ['image'] }
    ]);

    const out = await offerableModels(admin, 'image');

    expect(out.synced).toBe(true);
    expect(out.choices.map((c) => c.id)).toContain(GPT_IMAGE_2_MODEL);
  });

  it('ogni immagine offerta porta un unitCredits — il prezzo che il bottone "Genera" mostra', async () => {
    const admin = fakeAdmin([
      { id: 'openai/gpt-image-2', catalogue: 'image', input_modalities: ['text', 'image'], output_modalities: ['image'] }
    ]);

    const out = await offerableModels(admin, 'image');

    const choice = out.choices.find((c) => c.id === GPT_IMAGE_2_MODEL);
    expect(choice?.unitCredits).toBeGreaterThan(0);
  });

  it('un modello sincronizzato SENZA una riga di integrazione nostra è offerto comunque, con la resa prudente', async () => {
    // Un id che l'API immagini pubblica ma che non abbiamo mai integrato (nessuno spec in
    // image-models.ts lo referenzia): l'app segue OpenRouter (CLAUDE.md), non lo scarta perché
    // non l'abbiamo scritto a mano — 1:1 soltanto e nessun prezzo finché non lo misuriamo.
    const admin = fakeAdmin([
      { id: 'meta/muse-image', catalogue: 'image', input_modalities: ['text'], output_modalities: ['image'] }
    ]);

    const out = await offerableModels(admin, 'image');

    const choice = out.choices.find((c) => c.id === 'meta/muse-image');
    expect(choice).toBeDefined();
    expect(choice?.aspectRatios).toEqual(['1:1']);
    expect(choice?.unitCredits).toBeUndefined();
  });

  it('ogni modello immagine offre esattamente le sue risoluzioni sincronizzate, non un gradino condiviso', async () => {
    // Misurato live contro /images/models il 2026-09-25: Seedream 5 Lite non fa 1K, Seedream 5
    // Pro non fa 4K, Nano Banana 2 fa anche 512 — tre liste diverse per tre modelli diversi.
    const admin = fakeAdmin([
      {
        id: 'bytedance-seed/seedream-5-0-lite',
        catalogue: 'image',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        supported_parameters: ['resolution', 'aspect_ratio', 'n', 'input_references', 'seed'],
        supported_resolutions: ['2K', '4K']
      },
      {
        id: 'bytedance-seed/seedream-5-0-pro',
        catalogue: 'image',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        supported_parameters: ['resolution', 'aspect_ratio', 'n', 'input_references', 'seed'],
        supported_resolutions: ['1K', '2K']
      },
      {
        id: 'google/gemini-3.1-flash-image',
        catalogue: 'image',
        input_modalities: ['text', 'image'],
        output_modalities: ['image', 'text'],
        supported_parameters: ['resolution', 'aspect_ratio', 'n', 'input_references'],
        supported_resolutions: ['512', '1K', '2K', '4K']
      }
    ]);

    const out = await offerableModels(admin, 'image');

    const lite = out.choices.find((c) => c.id === 'seedream-5-lite');
    const pro = out.choices.find((c) => c.id === 'seedream-5-pro');
    const nanoBanana2 = out.choices.find((c) => c.id === 'nano-banana-2');

    expect(lite?.resolutions).toEqual(['2K', '4K']);
    expect(lite?.resolutions).not.toContain('1K');
    expect(pro?.resolutions).toEqual(['1K', '2K']);
    expect(pro?.resolutions).not.toContain('4K');
    expect(nanoBanana2?.resolutions).toEqual(['512', '1K', '2K', '4K']);
  });

  it('un modello immagine SENZA risoluzioni sincronizzate non offre il selettore (i GPT Image, che usano "quality")', async () => {
    const admin = fakeAdmin([
      {
        id: 'openai/gpt-image-2',
        catalogue: 'image',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        supported_parameters: ['aspect_ratio', 'quality', 'n', 'input_references'],
        supported_resolutions: []
      }
    ]);

    const out = await offerableModels(admin, 'image');

    const choice = out.choices.find((c) => c.id === GPT_IMAGE_2_MODEL);
    expect(choice?.resolutions).toBeUndefined();
  });

  it('un fatto di integrazione nostro SENZA una riga sincronizzata non è offerto', async () => {
    // La tabella non ha ALCUNA riga per l'id sul quale GPT Image 2 è mappato: la regola del
    // prodotto vale anche quando il sync è dietro, non solo quando manca del tutto.
    const admin = fakeAdmin([
      { id: 'google/gemini-3-pro-image', catalogue: 'image', input_modalities: ['text', 'image'], output_modalities: ['image'] }
    ]);

    const out = await offerableModels(admin, 'image');

    expect(out.choices.map((c) => c.id)).not.toContain(GPT_IMAGE_2_MODEL);
    expect(out.choices.map((c) => c.id)).toContain(NANO_BANANA_PRO_MODEL);
  });

  it('una tabella vuota è uno stato leggibile, non un crash: synced false e zero scelte', async () => {
    const admin = fakeAdmin([]);

    const out = await offerableModels(admin, 'image');

    expect(out.synced).toBe(false);
    expect(out.choices).toEqual([]);
  });

  it('il video si risolve dal listino /videos/models, non da output_modalities su /models', async () => {
    const admin = fakeAdmin([
      {
        id: 'bytedance/seedance-2.5',
        catalogue: 'video',
        input_modalities: ['text', 'image', 'audio'],
        output_modalities: ['video']
      }
    ]);

    const out = await offerableModels(admin, 'video');

    expect(out.synced).toBe(true);
    expect(out.choices.map((c) => c.id)).toContain(SEEDANCE_25_MODEL);
  });

  it('un video sincronizzato ma senza integrazione nostra resta fuori — es. Qwen esiste solo come immagine', async () => {
    const admin = fakeAdmin([
      { id: 'qwen/qwen-image-3-pro', catalogue: 'video', input_modalities: ['text'], output_modalities: ['video'] }
    ]);

    const out = await offerableModels(admin, 'video');

    expect(out.choices.map((c) => c.id)).not.toContain(QWEN3_PRO_MODEL);
  });

  it('un modello video con integrazione ma senza riga sincronizzata resta fuori', async () => {
    const admin = fakeAdmin([]);

    const out = await offerableModels(admin, 'video');

    expect(out.choices.map((c) => c.id)).not.toContain(OPENROUTER_UPSCALE_MODEL);
  });

  it('ogni scelta porta le modalità di ingresso sincronizzate — la tela le usa per disegnare le porte', async () => {
    const admin = fakeAdmin([
      { id: 'openai/gpt-image-2', catalogue: 'image', input_modalities: ['text', 'image'], output_modalities: ['image'] }
    ]);

    const out = await offerableModels(admin, 'image');
    const choice = out.choices.find((c) => c.id === GPT_IMAGE_2_MODEL);

    expect(choice?.inputModalities).toEqual(['text', 'image']);
  });

  it('ogni scelta porta un id e un nome leggibile', async () => {
    const admin = fakeAdmin([
      { id: 'openai/gpt-image-2', catalogue: 'image', input_modalities: ['text', 'image'], output_modalities: ['image'] }
    ]);

    const out = await offerableModels(admin, 'image');

    for (const choice of out.choices) {
      expect(choice.id).toBeTruthy();
      expect(choice.label).toBeTruthy();
    }
  });
});

describe('offerableSlotChoices — i sei mestieri delle settings, filtrati sui modelli offribili', () => {
  it('uno slot immagine offre solo modelli sincronizzati', async () => {
    const admin = fakeAdmin([
      { id: 'openai/gpt-image-2', catalogue: 'image', input_modalities: ['text', 'image'], output_modalities: ['image'] }
    ]);

    const out = await offerableSlotChoices(admin, mediaModelSlot('imageModel')!);

    expect(out.synced).toBe(true);
    expect(out.choices.map((c) => c.id)).toEqual([GPT_IMAGE_2_MODEL]);
  });

  it('uno slot video offre solo modelli sincronizzati CHE fanno quel ruolo', async () => {
    // Kling fa 'motion'; Seedance 2.5 no — un modello sincronizzato ma del ruolo sbagliato resta
    // fuori dallo slot, anche se compare nel catalogo video generale.
    const admin = fakeAdmin([
      { id: 'bytedance/seedance-2.5', catalogue: 'video', input_modalities: ['text', 'image'], output_modalities: ['video'] },
      { id: 'kwaivgi/kling-v3.0-pro', catalogue: 'video', input_modalities: ['text', 'image'], output_modalities: ['video'] }
    ]);

    const out = await offerableSlotChoices(admin, mediaModelSlot('videoMotionModel')!);

    expect(out.choices.map((c) => c.id)).toEqual([KLING_3_VIDEO_MODEL]);
    expect(out.choices.map((c) => c.id)).not.toContain(SEEDANCE_25_MODEL);
  });
});

describe('offerableModels video — durata e risoluzione', () => {
  it('un video offerto porta ogni secondo dentro la finestra del proprio modello', async () => {
    const admin = fakeAdmin([
      { id: 'bytedance/seedance-2.5', catalogue: 'video', input_modalities: ['text', 'image'], output_modalities: ['video'] }
    ]);

    const out = await offerableModels(admin, 'video');

    const choice = out.choices.find((c) => c.id === SEEDANCE_25_MODEL);
    expect(choice?.durationOptions).toEqual(Array.from({ length: 27 }, (_, i) => i + 4));
  });

  it('un video offerto porta le SUE risoluzioni sincronizzate, non un elenco condiviso', async () => {
    const admin = fakeAdmin([
      {
        id: 'bytedance/seedance-2.5',
        catalogue: 'video',
        input_modalities: ['text', 'image'],
        output_modalities: ['video'],
        supported_resolutions: ['480p', '720p']
      }
    ]);

    const out = await offerableModels(admin, 'video');

    const choice = out.choices.find((c) => c.id === SEEDANCE_25_MODEL);
    expect(choice?.resolutions).toEqual(['480p', '720p']);
  });

  it('happyhorse non offre 480p: la riga sincronizzata dichiara solo 720p/1080p (regressione cb1de6e2)', async () => {
    const admin = fakeAdmin([
      {
        id: 'alibaba/happyhorse-1.0',
        catalogue: 'video',
        input_modalities: ['text', 'image'],
        output_modalities: ['video'],
        supported_resolutions: ['720p', '1080p']
      }
    ]);

    const out = await offerableModels(admin, 'video');

    const choice = out.choices.find((c) => c.id === 'alibaba/happyhorse-1.0');
    expect(choice?.resolutions).toEqual(['720p', '1080p']);
    expect(choice?.resolutions).not.toContain('480p');
  });

  it('una riga sincronizzata senza supported_resolutions ripiega sul tetto misurato del trasporto', async () => {
    const admin = fakeAdmin([
      {
        id: 'bytedance/seedance-2.5',
        catalogue: 'video',
        input_modalities: ['text', 'image'],
        output_modalities: ['video'],
        supported_resolutions: []
      }
    ]);

    const out = await offerableModels(admin, 'video');

    const choice = out.choices.find((c) => c.id === SEEDANCE_25_MODEL);
    expect(choice?.resolutions).toEqual(['480p', '720p']);
  });
});

describe('offerableModels video — un id senza spec è offerto con la resa prudente', () => {
  it('non sparisce dal menu: 9:16 soltanto, nessun prezzo', async () => {
    const admin = fakeAdmin([
      { id: 'wan/wan-3.0', catalogue: 'video', input_modalities: ['text'], output_modalities: ['video'] }
    ]);

    const out = await offerableModels(admin, 'video');

    const choice = out.choices.find((c) => c.id === 'wan/wan-3.0');
    expect(choice).toBeDefined();
    expect(choice?.aspectRatios).toEqual(['9:16']);
    expect(choice?.unitCredits).toBeUndefined();
  });

  it('non entra in nessuno slot delle Settings: il ruolo che sa fare resta ignoto', async () => {
    const admin = fakeAdmin([
      { id: 'wan/wan-3.0', catalogue: 'video', input_modalities: ['text'], output_modalities: ['video'] }
    ]);

    const slot = mediaModelSlot('videoModel')!;
    const out = await offerableSlotChoices(admin, slot);

    expect(out.choices.map((c) => c.id)).not.toContain('wan/wan-3.0');
  });
});

describe('offerableModels — params dal param_schema sincronizzato', () => {
  it('un GPT Image con quality/background nello schema li porta come params, non aspect_ratio', async () => {
    const admin = fakeAdmin([
      {
        id: 'openai/gpt-image-2',
        catalogue: 'image',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        param_schema: {
          aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
          quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high'] }
        }
      }
    ]);

    const out = await offerableModels(admin, 'image');

    const choice = out.choices.find((c) => c.id === GPT_IMAGE_2_MODEL);
    expect(choice?.params).toEqual([
      { name: 'quality', label: 'Qualità', kind: 'enum', values: ['auto', 'low', 'medium', 'high'] }
    ]);
  });

  it('un modello senza param_schema porta params vuoti', async () => {
    const admin = fakeAdmin([
      { id: 'openai/gpt-image-2', catalogue: 'image', input_modalities: ['text', 'image'], output_modalities: ['image'] }
    ]);

    const out = await offerableModels(admin, 'image');

    const choice = out.choices.find((c) => c.id === GPT_IMAGE_2_MODEL);
    expect(choice?.params).toEqual([]);
  });

  it('generate_audio non entra nei params: ha già il campo "audio" dedicato', async () => {
    const admin = fakeAdmin([
      {
        id: 'bytedance/seedance-2.5',
        catalogue: 'video',
        input_modalities: ['text'],
        output_modalities: ['video'],
        param_schema: { generate_audio: { type: 'boolean' }, seed: { type: 'boolean' } }
      }
    ]);

    const out = await offerableModels(admin, 'video');

    const choice = out.choices.find((c) => c.id === SEEDANCE_25_MODEL);
    expect(choice?.params).toEqual([{ name: 'seed', label: 'Seed', kind: 'boolean' }]);
  });
});
