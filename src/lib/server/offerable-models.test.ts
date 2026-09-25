import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GPT_IMAGE_2_MODEL, NANO_BANANA_PRO_MODEL, QWEN3_PRO_MODEL } from '$lib/image-models';
import { SEEDANCE_25_MODEL, OPENROUTER_UPSCALE_MODEL, KLING_3_VIDEO_MODEL } from '$lib/video-models';
import { mediaModelSlot } from '$lib/media-model-slots';
import { offerableModels, offerableSlotChoices } from './offerable-models';

function fakeAdmin(rows: { id: string; catalogue: string; input_modalities: string[]; output_modalities: string[] }[]) {
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

  it('un modello sincronizzato SENZA una riga di integrazione nostra non è offerto', async () => {
    // Un id che l'API immagini pubblica ma che non abbiamo mai integrato (nessuno spec in
    // image-models.ts lo referenzia): sappiamo cosa accetta, non sappiamo come chiamarlo.
    const admin = fakeAdmin([
      { id: 'meta/muse-image', catalogue: 'image', input_modalities: ['text'], output_modalities: ['image'] }
    ]);

    const out = await offerableModels(admin, 'image');

    expect(out.choices.map((c) => c.id)).not.toContain('meta/muse-image');
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
