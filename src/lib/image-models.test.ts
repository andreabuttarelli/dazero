import { describe, it, expect, vi } from 'vitest';
import {
  IMAGE_MODEL_CHOICES,
  NANO_BANANA_PRO_MODEL,
  SEEDREAM_5_PRO_MODEL,
  GPT_IMAGE_2_MODEL,
  GPT_IMAGE_25_SUNBURST_MODEL,
  GPT_IMAGE_25_FLARE_MODEL,
  NANO_BANANA_2_MODEL,
  QWEN3_PRO_MODEL,
  openrouterImagesSize,
  imageModelSpec,
  imageRefineModelFor,
  isKnownImageModelId,
  imageModelFor,
  googleImageModel
} from './image-models';

/**
 * NESSUN DIALETTO DI UN FORNITORE CHE NON C'È PIÙ.
 *
 * Lo spec portava sei campi che descrivevano il payload di un fornitore che non c'è più — i nomi
 * dei riferimenti, del rapporto, della dimensione. Nessun trasporto vivo li legge: l'unico campo
 * che i due trasporti OpenRouter consultano davvero è `maxRefs`. Un campo che nessuno legge non è
 * documentazione: è una riga che il prossimo lettore crede governi qualcosa.
 */
describe('il registro non descrive più il payload di nessun fornitore', () => {
  it('nessuno spec porta i campi del dialetto', () => {
    for (const choice of IMAGE_MODEL_CHOICES) {
      const spec = imageModelSpec(choice.id) as Record<string, unknown>;
      for (const dead of ['kie', 'refField', 'aspectField', 'sizeField', 'ratios1KOnly', 'outputFormat']) {
        expect(dead in spec, `${choice.id} porta ancora ${dead}`).toBe(false);
      }
    }
  });

  it('ma il tetto dei riferimenti resta: lo legge il trasporto', () => {
    for (const choice of IMAGE_MODEL_CHOICES) {
      expect(imageModelSpec(choice.id)!.maxRefs, choice.id).toBeGreaterThan(0);
    }
  });
});

describe('image models', () => {
  it('ogni scelta offerta è riconosciuta', () => {
    for (const choice of IMAGE_MODEL_CHOICES) {
      expect(isKnownImageModelId(choice.id)).toBe(true);
    }
  });

  it('un id sconosciuto non passa', () => {
    expect(isKnownImageModelId('gpt-image-9')).toBe(false);
    expect(isKnownImageModelId('')).toBe(false);
    expect(isKnownImageModelId(undefined)).toBe(false);
  });

  it('la preferenza del brand vince quando è nota', () => {
    expect(imageModelFor({ imageModel: SEEDREAM_5_PRO_MODEL })).toBe(SEEDREAM_5_PRO_MODEL);
  });

  it('senza preferenza il renderer resta libero di scegliere', () => {
    expect(imageModelFor({})).toBeUndefined();
    expect(imageModelFor(null)).toBeUndefined();
    expect(imageModelFor({ imageModel: 'un-modello-che-non-esiste' })).toBeUndefined();
  });

  it('un id Gemini scritto a mano da un call site resta uno spec valido', () => {
    expect(imageModelSpec('gemini-3-pro-image-preview')?.id).toBe(NANO_BANANA_PRO_MODEL);
  });

  it('solo i nano-banana esistono anche sulla via Gemini', () => {
    expect(imageModelSpec(NANO_BANANA_PRO_MODEL)?.google).toBe('gemini-3-pro-image-preview');
    expect(imageModelSpec(SEEDREAM_5_PRO_MODEL)?.google).toBeNull();
    expect(imageModelSpec(GPT_IMAGE_2_MODEL)?.google).toBeNull();
    expect(imageModelSpec(QWEN3_PRO_MODEL)?.google).toBeNull();
  });

  // Sulla via Gemini "seedream/5-pro-…" non è un modello: sarebbe un 400 su OGNI immagine del
  // brand. Si ripiega sul modello di casa, rumorosamente.
  it('un modello che quella via non serve non ci arriva mai', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(googleImageModel(SEEDREAM_5_PRO_MODEL, 'gemini-3.1-flash-image')).toBe('gemini-3.1-flash-image');
    expect(googleImageModel(QWEN3_PRO_MODEL, 'gemini-3.1-flash-image')).toBe('gemini-3.1-flash-image');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('i nano-banana passano con il loro id Gemini', () => {
    expect(googleImageModel(NANO_BANANA_PRO_MODEL, 'x')).toBe('gemini-3-pro-image-preview');
    expect(googleImageModel('gemini-3.1-flash-image', 'x')).toBe('gemini-3.1-flash-image');
    // Un id che il catalogo non conosce resta quello che il call site ha chiesto.
    expect(googleImageModel('gemini-4-whatever', 'x')).toBe('gemini-4-whatever');
  });

  it('il tetto dei riferimenti è quello del modello, non uno globale', () => {
    expect(imageModelSpec(QWEN3_PRO_MODEL)!.maxRefs).toBe(3);
    expect(imageModelSpec(GPT_IMAGE_2_MODEL)!.maxRefs).toBe(16);
    expect(imageModelSpec(NANO_BANANA_PRO_MODEL)!.maxRefs).toBe(8);
  });
});

describe('the refine model', () => {
  it('falls back to the generation model when none was chosen', () => {
    // Editing a photo has always used whatever model drew it. A brand that never opens the new
    // picker must keep exactly that, not lose its choice to an empty second slot.
    expect(imageRefineModelFor({ imageModel: SEEDREAM_5_PRO_MODEL })).toBe(SEEDREAM_5_PRO_MODEL);
  });

  it('lets the brand refine with a different model than it generates with', () => {
    expect(
      imageRefineModelFor({ imageModel: SEEDREAM_5_PRO_MODEL, imageRefineModel: GPT_IMAGE_2_MODEL })
    ).toBe(GPT_IMAGE_2_MODEL);
  });

  it('ignores a refine model the catalogue no longer serves', () => {
    expect(imageRefineModelFor({ imageRefineModel: 'seedream-4-legacy' })).toBeUndefined();
  });
});

/**
 * I modelli che vivono SOLO sull'API immagini di OpenRouter.
 *
 * Misurato il 2026-09-12 su `GET /api/v1/images/models` e con render veri: `openai/gpt-image-2.5-*`
 * non esiste sulla via Gemini, e il suo endpoint non è `chat/completions` — è `POST /images`,
 * con `input_references` per le modifiche e `aspect_ratio` da un elenco chiuso che NON contiene
 * 4:5, cioè il formato di un post Instagram. Quel buco si copre con `size`, che l'endpoint onora
 * al pixel (1024x1280 chiesto, 1024x1280 tornato) pur non essendo documentato.
 */
describe('i modelli dell’API immagini di OpenRouter', () => {
  it('GPT Image 2.5 Sunburst e Flare sono nel catalogo del brand', () => {
    expect(isKnownImageModelId(GPT_IMAGE_25_SUNBURST_MODEL)).toBe(true);
    expect(isKnownImageModelId(GPT_IMAGE_25_FLARE_MODEL)).toBe(true);
    const ids = IMAGE_MODEL_CHOICES.map((c) => c.id);
    expect(ids).toContain(GPT_IMAGE_25_SUNBURST_MODEL);
    expect(ids).toContain(GPT_IMAGE_25_FLARE_MODEL);
  });

  // «E gli altri no» era vero finché solo i GPT Image 2.5 stavano sull'API immagini. Ora ogni
  // riga del registro porta il suo id: i sei che mancavano sono su `/api/v1/images/models`, un
  // catalogo separato da `/models` — cercarli nel primo è il motivo per cui sembravano assenti.
  it('ognuno porta l’id con cui OpenRouter lo chiama', () => {
    expect(imageModelSpec(GPT_IMAGE_25_SUNBURST_MODEL)?.openrouterImages).toBe(
      'openai/gpt-image-2.5-sunburst'
    );
    expect(imageModelSpec(NANO_BANANA_2_MODEL)?.openrouterImages).toBe(
      'google/gemini-3.1-flash-image'
    );
  });

  it('si riconoscono anche dall’id di OpenRouter, non solo dal nostro', () => {
    expect(imageModelSpec('openai/gpt-image-2.5-flare')?.id).toBe(GPT_IMAGE_25_FLARE_MODEL);
  });

  it('non esistono sulla via Gemini: chi ci finisce lo scopre, non lo indovina', () => {
    expect(imageModelSpec(GPT_IMAGE_25_SUNBURST_MODEL)!.google).toBeNull();
  });

  it('4:5 lo servono, perché è il formato di un post', () => {
    expect(imageModelSpec(GPT_IMAGE_25_SUNBURST_MODEL)!.aspectRatios).toContain('4:5');
  });
});

describe('openrouterImagesSize', () => {
  it('i rapporti che l’elenco chiuso di OpenRouter ha non passano da size', () => {
    expect(openrouterImagesSize('1:1')).toBeUndefined();
    expect(openrouterImagesSize('9:16')).toBeUndefined();
  });

  it('4:5 e 5:4 non sono in quell’elenco: si chiedono in pixel, o tornerebbe un 400', () => {
    expect(openrouterImagesSize('4:5')).toBe('1024x1280');
    expect(openrouterImagesSize('5:4')).toBe('1280x1024');
  });

  it('un rapporto che non si capisce non inventa una dimensione', () => {
    expect(openrouterImagesSize(undefined)).toBeUndefined();
    expect(openrouterImagesSize('banana')).toBeUndefined();
  });
});

/**
 * OGNI MODELLO IMMAGINE HA UNA STRADA SU OPENROUTER.
 *
 * Erano sei righe con `openrouterImages: null`, e tre di quelle — seedream-5-pro, gpt-image-2,
 * qwen3-pro — non avevano nemmeno un id Google: sarebbero degradate in silenzio su
 * Nano Banana, con un `console.warn` e un'immagine che il brand non aveva chiesto.
 *
 * Ci sono tutte: su `/api/v1/images/models` (52 modelli), un catalogo separato da `/models`.
 * Cercarle nel posto sbagliato è il motivo per cui sembravano assenti.
 */
describe('nessun modello immagine resta senza trasporto', () => {
  it('ogni modello del registro dichiara un id OpenRouter', () => {
    const orphans = IMAGE_MODEL_CHOICES
      .map((c) => imageModelSpec(c.id))
      .filter((s) => s && !s.openrouterImages)
      .map((s) => s!.id);

    expect(orphans, 'senza questi id il modello non è raggiungibile').toEqual([]);
  });

  it('i tre che non hanno una casa su Gemini hanno il loro id', () => {
    expect(imageModelSpec(SEEDREAM_5_PRO_MODEL)?.openrouterImages).toBe('bytedance-seed/seedream-5-0-pro');
    expect(imageModelSpec(GPT_IMAGE_2_MODEL)?.openrouterImages).toBe('openai/gpt-image-2');
    expect(imageModelSpec(QWEN3_PRO_MODEL)?.openrouterImages).toBe('qwen/qwen-image-3-pro');
  });
});
