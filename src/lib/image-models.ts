/**
 * I modelli che possono disegnare per un brand, e COME ciascuno vuole essere chiamato.
 *
 * Ogni modello ha i suoi rapporti e il suo tetto di riferimenti: i riferimenti si
 * chiamano `image_input` su Nano Banana, `image_urls` su Seedream e Qwen, `input_urls` su GPT
 * Image; il rapporto d'aspetto è `aspect_ratio` per tutti tranne Qwen, che lo chiama `image_size`;
 * la dimensione è `resolution` per alcuni e `quality` (basic|high) per Seedream. Metà di queste
 * famiglie separa il modello testo-a-immagine da quello con riferimenti.
 *
 * Le differenze stanno TUTTE qui, in una riga per modello, perché una famiglia nuova sia una riga
 * e non una caccia a cinque `if` sparsi. Le assenze sono la parte che conta: `4:5` — il formato di
 * un post Instagram — non esiste su Seedream né su Qwen, e `google` è null per tutto ciò che
 * serve in esclusiva.
 *
 */

import { nearestAspectRatio } from '$lib/aspect-ratio';

export const NANO_BANANA_PRO_MODEL = 'nano-banana-pro';
export const NANO_BANANA_2_MODEL = 'nano-banana-2';
export const NANO_BANANA_2_LITE_MODEL = 'nano-banana-2-lite';
export const SEEDREAM_5_PRO_MODEL = 'seedream-5-pro';
export const GPT_IMAGE_2_MODEL = 'gpt-image-2';
export const GPT_IMAGE_25_SUNBURST_MODEL = 'gpt-image-2.5-sunburst';
export const GPT_IMAGE_25_FLARE_MODEL = 'gpt-image-2.5-flare';
export const QWEN3_PRO_MODEL = 'qwen3-pro';

/** Gli id Gemini che i call site scrivono a mano da prima che questo registro esistesse. */
export const GEMINI_NANO_BANANA_PRO = 'gemini-3-pro-image-preview';
export const GEMINI_NANO_BANANA_2 = 'gemini-3.1-flash-image';
export const GEMINI_NANO_BANANA_2_LITE = 'gemini-3.1-flash-lite-image';

export type ImageModelSpec = {
  id: string;
  label: string;
  /** L'id su Google, quando lo stesso modello esiste anche lì. null = non esiste su Google. */
  google: string | null;
  /**
   * L'id sull'API immagini di OpenRouter (`POST /api/v1/images`), che NON è `chat/completions`:
   * corpo diverso (`prompt`, `input_references`, `aspect_ratio`) e risposta diversa (`b64_json`).
   * null = quel trasporto non lo serve, e la famiglia passa dalla via Gemini come ha sempre fatto.
   */
  openrouterImages: string | null;
  /** Quanti riferimenti il modello inoltra davvero. */
  maxRefs: number;
  /** I rapporti che il modello accetta. Fuori da qui il provider risponde 500 dopo un giro di rete. */
  aspectRatios: string[];
};

const NANO_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

const SPECS: ImageModelSpec[] = [
  {
    id: NANO_BANANA_2_LITE_MODEL,
    label: 'Nano Banana 2 Lite',
    google: GEMINI_NANO_BANANA_2_LITE,
    openrouterImages: 'google/gemini-3.1-flash-lite-image',
    maxRefs: 10,
    aspectRatios: NANO_ASPECTS,
  },
  {
    id: NANO_BANANA_2_MODEL,
    label: 'Nano Banana 2',
    google: GEMINI_NANO_BANANA_2,
    openrouterImages: 'google/gemini-3.1-flash-image',
    // Il fornitore ne documenta 14; 8 è il tetto che il prodotto impone e che i prompt assumono.
    maxRefs: 8,
    aspectRatios: NANO_ASPECTS,
  },
  {
    id: NANO_BANANA_PRO_MODEL,
    label: 'Nano Banana Pro',
    google: GEMINI_NANO_BANANA_PRO,
    openrouterImages: 'google/gemini-3-pro-image',
    maxRefs: 8,
    aspectRatios: NANO_ASPECTS,
  },
  {
    id: SEEDREAM_5_PRO_MODEL,
    label: 'Seedream 5 Pro',
    google: null,
    openrouterImages: 'bytedance-seed/seedream-5-0-pro',
    maxRefs: 10,
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'],
  },
  {
    id: GPT_IMAGE_2_MODEL,
    label: 'GPT Image 2',
    google: null,
    openrouterImages: 'openai/gpt-image-2',
    maxRefs: 16,
    aspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9'],
  },
  /**
   * I due GPT Image 2.5. Esistono SOLO sull'API immagini di OpenRouter — non sulla via Gemini
   * — e sono gli unici del catalogo così. Misurato il 2026-09-12, render veri:
   *
   *   generazione   $0,0053   10-15s     contro $0,0748 e 13,3s del Gemini su OpenRouter
   *   con riferimenti $0,017  15,6s      contro lo stesso $0,0748
   *
   * Cioè 14× meno per un'immagine disegnata da zero e 4× meno per una modificata, a parità di
   * tempo. `sunburst` è il taglio di precisione e `flare` quello di velocità (10,5s contro 15,0s,
   * stesso prezzo): il default è sunburst perché qui dentro le immagini portano testo, e il testo
   * sbagliato si rifà.
   *
   * `maxRefs: 16` è il tetto che OpenRouter dichiara per `input_references` e che abbiamo visto
   * accettato. Il 4:5 NON è nel loro elenco di rapporti: si chiede in pixel, vedi
   * `openrouterImagesSize`.
   */
  {
    id: GPT_IMAGE_25_SUNBURST_MODEL,
    label: 'GPT Image 2.5 Sunburst',
    google: null,
    openrouterImages: 'openai/gpt-image-2.5-sunburst',
    maxRefs: 16,
    aspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '16:9', '9:16', '21:9'],
  },
  {
    id: GPT_IMAGE_25_FLARE_MODEL,
    label: 'GPT Image 2.5 Flare',
    google: null,
    openrouterImages: 'openai/gpt-image-2.5-flare',
    maxRefs: 16,
    aspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '16:9', '9:16', '21:9'],
  },
  {
    id: QWEN3_PRO_MODEL,
    label: 'Qwen3 Pro',
    google: null,
    openrouterImages: 'qwen/qwen-image-3-pro',
    maxRefs: 3,
    aspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'],
  }
];

export const IMAGE_MODEL_CHOICES = SPECS.map((s) => ({ id: s.id, label: s.label }));

export function isKnownImageModelId(value: unknown): value is string {
  return !!imageModelSpec(value);
}

/**
 * Lo spec di un modello, da qualunque nome quel modello abbia: il nostro id, l'id Gemini scritto in
 * un vecchio call site. Riconoscerli tutti è ciò che impedisce a un
 * `seedream/5-pro-image-to-image` di ripresentarsi come modello sconosciuto e finire nel dialetto
 * sbagliato.
 */
/**
 * Il tetto che un prompt deve ASSUMERE, non quello del modello di turno: `maxRefs` varia da 3 a 16
 * fra i modelli del registro, e chi scrive uno strumento non sa quale modello renderizzerà. Sotto
 * questa soglia nessuna immagine viene buttata via da nessuno.
 *
 * Conta TUTTO quello che finisce allegato, anche ciò che l'utente non ha chiesto — logo, base,
 * mood. Chiunque alzi un limite negli strumenti deve passare da qui: superarlo non fa sparire il
 * taglio, lo sposta dentro il provider, dove non ha nemmeno il nome delle immagini che scarta.
 */
export const IMAGE_REFS_BUDGET = 8;

export function imageModelSpec(value: unknown): ImageModelSpec | undefined {
  const v = String(value ?? '').trim();
  if (!v) return undefined;
  return SPECS.find(
    (s) => s.id === v || s.google === v || s.openrouterImages === v
  );
}

/**
 * Undefined vuol dire "nessuna preferenza": il renderer continua a decidere per ogni immagine,
 * che è il comportamento che ogni brand aveva prima che il selettore esistesse.
 */
export function imageModelFor(prefs: { imageModel?: unknown } | null | undefined): string | undefined {
  const v = String(prefs?.imageModel ?? '').trim();
  return isKnownImageModelId(v) ? v : undefined;
}

/**
 * Il modello con cui si MODIFICA una foto, che non e' per forza quello con cui la si disegna:
 * riprodurre fedelmente una immagine gia' esistente e inventarne una da zero sono due mestieri, e
 * la famiglia piu' brava al primo non e' sempre la piu' brava al secondo.
 *
 * Senza una scelta propria vale quella della generazione — che e' esattamente cio' che facevano
 * tutti i brand prima che questo secondo selettore esistesse.
 */
export function imageRefineModelFor(
  prefs: { imageModel?: unknown; imageRefineModel?: unknown } | null | undefined
): string | undefined {
  const v = String(prefs?.imageRefineModel ?? '').trim();
  if (v) return isKnownImageModelId(v) ? v : undefined;
  return imageModelFor(prefs);
}

/**
 * L'id con cui il gateway serve lo stesso modello sulla via Gemini. Un modello che lì non esiste
 * darebbe un 400 su ogni immagine del brand: meglio un render col modello di casa e un avviso
 * rumoroso, che la preferenza applicata a vuoto.
 */
export function googleImageModel(model: string | undefined, fallback: string): string {
  const spec = imageModelSpec(model);
  if (!spec) return model ?? fallback;
  if (spec.google) return spec.google;
  console.warn(
    `[AI] ${spec.id} non esiste sulla via Gemini e questo render sta passando di lì: uso ${fallback}. ` +
      `La preferenza del brand non è stata applicata.`
  );
  return fallback;
}

/**
 * I rapporti che l'API immagini di OpenRouter accetta per nome. È un elenco CHIUSO — un valore
 * fuori da qui torna 400 «Provider rejection», misurato — e 4:5 non c'è.
 */
const OPENROUTER_IMAGES_RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'];

/**
 * I rapporti che quell'elenco non ha, chiesti in pixel.
 *
 * `size` non è documentato fra i parametri del modello, ma l'endpoint lo onora al pixel: chiesto
 * 1024x1280, tornato 1024x1280, sei volte su sei e anche insieme ai riferimenti. È l'unico modo di
 * avere un 4:5, cioè l'inquadratura di ogni post Instagram: senza, ogni post verticale del brand
 * diventerebbe un 3:4, che è un'altra cosa.
 *
 * Undefined per tutto il resto, di proposito: dove il nome basta si usa il nome, che è la strada
 * documentata e quella che non può sparire.
 */
export function openrouterImagesSize(aspectRatio: string | undefined): string | undefined {
  switch (String(aspectRatio ?? '').trim()) {
    case '4:5':
      return '1024x1280';
    case '5:4':
      return '1280x1024';
    default:
      return undefined;
  }
}

/** Il rapporto da mandare per NOME, quando quel nome esiste. Altrimenti decide `openrouterImagesSize`. */
export function openrouterImagesAspectRatio(aspectRatio: string | undefined): string | undefined {
  const v = String(aspectRatio ?? '').trim();
  return OPENROUTER_IMAGES_RATIOS.includes(v) ? v : undefined;
}
