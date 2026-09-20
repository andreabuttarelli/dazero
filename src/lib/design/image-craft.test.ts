import { describe, it, expect } from 'vitest';
import { imageCraftFor, IMAGE_CRAFT } from './image-craft';
import {
  GEMINI_NANO_BANANA_2,
  IMAGE_MODEL_CHOICES,
  NANO_BANANA_2_LITE_MODEL,
  NANO_BANANA_PRO_MODEL,
  SEEDREAM_5_PRO_MODEL,
  GPT_IMAGE_2_MODEL
} from '$lib/image-models';

describe('il craft immagine è per modello, perché i modelli vogliono prompt diversi', () => {
  it('ogni voce dichiara i modelli a cui si applica e dice qualcosa di sostanziale', () => {
    for (const entry of IMAGE_CRAFT) {
      expect(entry.models.length).toBeGreaterThan(0);
      expect(entry.text.length).toBeGreaterThan(100);
    }
  });

  it('nessun modello compare in due voci: due regole per lo stesso modello divergono', () => {
    const seen = IMAGE_CRAFT.flatMap((e) => e.models);

    expect(new Set(seen).size).toBe(seen.length);
  });

  it('gpt-image chiede segmenti etichettati e sa scrivere: lo dice', () => {
    const text = imageCraftFor(GPT_IMAGE_2_MODEL);

    expect(text).toMatch(/segment|label/i);
    expect(text).toMatch(/transparent/i);
  });

  it('seedream indirizza le immagini per numero, e in edit vuole un comando', () => {
    const text = imageCraftFor(SEEDREAM_5_PRO_MODEL);

    expect(text).toMatch(/image 1|figure/i);
    expect(text).toMatch(/command/i);
  });

  it('nano banana vuole frasi connesse, e per illustrare vuole meno parole non di più', () => {
    const text = imageCraftFor(GEMINI_NANO_BANANA_2);

    expect(text).toMatch(/sentence/i);
    expect(text).toMatch(/illustration/i);
  });

  it('tutta la famiglia nano riceve lo stesso craft: lite, 2 e pro', () => {
    const base = imageCraftFor(GEMINI_NANO_BANANA_2);

    expect(imageCraftFor(NANO_BANANA_2_LITE_MODEL)).toBe(base);
    expect(imageCraftFor(NANO_BANANA_PRO_MODEL)).toBe(base);
  });

  it('due famiglie diverse non ricevono lo stesso testo', () => {
    expect(imageCraftFor(GPT_IMAGE_2_MODEL)).not.toBe(imageCraftFor(SEEDREAM_5_PRO_MODEL));
  });

  it('un modello che non conosciamo non riceve consigli inventati', () => {
    expect(imageCraftFor('un-modello-mai-visto')).toBe('');
    expect(imageCraftFor(undefined)).toBe('');
  });

  // Il cancello che tiene il registro onesto: un modello nuovo in `image-models.ts` senza il suo
  // craft fa fallire QUESTO test, invece di uscire in silenzio con un prompt generico.
  it('ogni modello del registro ha il suo craft', () => {
    for (const { id } of IMAGE_MODEL_CHOICES) {
      expect(imageCraftFor(id), `nessun craft per ${id}`).not.toBe('');
    }
  });
});
