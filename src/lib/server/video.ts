import type { SupabaseClient } from '@supabase/supabase-js';
import { videoModel } from '$lib/server/model-routing';
import { OPENROUTER_UPSCALE_MODEL } from '$lib/video-models';
import { videoCraftFor } from '$lib/design/video-craft';
import { getBrandContext, getOrgContext, logAiCall } from '$lib/server/ai-log';
import { isVideoUrl } from '$lib/content-formats';
import {
  VIDEO_MODEL_CHOICES as SHARED_VIDEO_MODEL_CHOICES,
  isKnownVideoModelId,
  clampVideoPrompt,
  videoModelCaps,
  videoModelForRole,
  videoModelSpec,
  videoDurationOptions as sharedVideoDurationOptions,
  type VideoRole
} from '$lib/video-models';
import {
  checkOpenrouterVideo,
  openrouterVideoHeaders,
  openrouterVideoModel,
  renderOpenrouterVideo,
  submitOpenrouterVideo,
  tagOpenrouterJob,
  untagOpenrouterJob
} from '$lib/server/openrouter-video';

/** Quel che un render finito lascia a chi lo persiste: dove sta il file, e sotto quale id. */
type VideoJobResult = { url: string; taskId: string };

// È il percorso a PAGAMENTO: la preview gratuita di onboarding non passa mai di qui, quindi un
// utente free non incorre nel costo video.
//
// IMAGE-TO-VIDEO per primo: con la cover già renderizzata il modello anima QUELLA, quindi tutto il
// grounding fatto dalla pipeline immagini (prodotto vero, identità della persona, palette, QC)
// entra nella clip gratis e il prompt deve dirigere solo il MOVIMENTO. Il text-to-video è il
// ripiego quando la cover non c'è.
//
// Best-effort e NON fatale: a qualunque fallimento si torna undefined e il chiamante ripiega sulla
// cover — un post deve essere sempre creabile, il video è un bonus.

// Grok espone i2v e t2v come due id DISTINTI (Seedance ha un id solo + first_frame_url opzionale).
// I tetti di durata NON sono mai env var: vengono da `videoModelCaps(model)` per il modello che
// esegue davvero il job. Gli id e i default vivono nel registro (`model-routing.ts`).
function envModelI2V(): string {
  return videoModel('i2v');
}
function envModelT2V(): string {
  return videoModel('t2v');
}
// 480p è il default perché il video si fattura al secondo e il 720p costa ESATTAMENTE il doppio
// (misurato). Ogni bozza si paga, comprese quelle che nessuno approva, quindi il default sta sul
// gradino economico: su un telefono la differenza si vede poco, sul conto no.
//
// I due che offriamo per default a un modello sincronizzato SENZA una riga di risoluzioni ancora
// (`offerable-models.ts::genericVideoChoice`) — non il tetto del trasporto, che è più largo (v.
// `OPENROUTER_RESOLUTION_TOKENS` sotto).
export const VIDEO_RESOLUTIONS = ['480p', '720p'] as const;
const DEFAULT_RESOLUTION = '480p';

/**
 * L'INTERO enum che `POST /videos` valida, per QUALUNQUE modello — verificato in diretta
 * (2026-09-25, `resolution: 'nonsense'` contro `alibaba/happyhorse-1.0`): `ZodError` elenca
 * esattamente questi otto token, minuscoli, mai un `1080P` con la maiuscola. Un modello preciso
 * ne accetta un sottoinsieme (`ai_models.supported_resolutions`, letto da `offerable-models.ts`
 * per COSA OFFRIRE); questo elenco è il tetto — l'ultima barriera prima del fornitore, quando
 * qui non c'è una connessione al database da cui leggere il sottoinsieme del modello scelto.
 */
const OPENROUTER_RESOLUTION_TOKENS = ['360p', '480p', '720p', '768p', '1080p', '1k', '2k', '4k'] as const;

/** Un valore stantio o scritto a mano non deve raggiungere il provider. */
export function clampVideoResolution(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase();
  if ((OPENROUTER_RESOLUTION_TOKENS as readonly string[]).includes(v)) {
    // '1k'/'2k'/'4k' arrivano minuscoli dal trim sopra: il fornitore vuole la K maiuscola.
    return v.endsWith('k') ? v.toUpperCase() : v;
  }
  return DEFAULT_RESOLUTION;
}
/** What an approved clip gets upscaled to. */
export const UPSCALE_RESOLUTION = '720p';

export { clampVideoPrompt } from '$lib/video-models';

export type { VideoModelFamily, VideoModelCaps } from '$lib/video-models';
export { videoModelCaps } from '$lib/video-models';

/** Seedance (and similar) use one model id for I2V and T2V; Grok needs a paired T2V id. */
export function pairedTextToVideoModel(model: string): string {
  if (/^bytedance\/seedance-2/.test(model)) return model;
  if (/^grok-imagine-video-1-5/.test(model) || /image-to-video/.test(model)) {
    return envModelT2V();
  }
  return model;
}

/**
 * Precedenza: modello esplicito del tool → scelta del brand PER QUESTO LAVORO → default d'ambiente.
 *
 * `hasCover` non e' un dettaglio di implementazione: e' cio' che distingue i due mestieri. Con una
 * cover il modello ANIMA una immagine che esiste, senza scrive dal nulla, e il brand puo' aver
 * scelto due modelli diversi. Chi chiama non sa ancora quale dei due sara' — la cover si scopre
 * qui — quindi passa le preferenze intere e il ruolo lo decide questa funzione.
 */
export function resolveVideoModel(opts: {
  model?: string | null;
  prefs?: Record<string, unknown> | null;
  hasCover: boolean;
}): string {
  const preferred =
    opts.model?.trim() || videoModelForRole(opts.prefs, opts.hasCover ? 'image' : 'text');
  if (preferred) {
    if (!opts.hasCover) return pairedTextToVideoModel(preferred);
    return preferred;
  }
  return opts.hasCover ? envModelI2V() : envModelT2V();
}

/** Re-export shared allow-list so server callers keep importing from this module. */
export const VIDEO_MODEL_CHOICES = SHARED_VIDEO_MODEL_CHOICES;

export function isKnownVideoModel(value: unknown): value is string {
  return isKnownVideoModelId(value);
}

// Il pavimento di PRODOTTO è più alto del minimo dei provider: sotto i ~10s una clip non regge
// hook → body → cta a ritmo social (~3.5 parole/s con margine) e la cta viene tagliata.
export const MIN_DURATION = 10;
// Ultima spiaggia, quando non si sa nient'altro. NON è il default di prodotto: si preferisce
// sempre `suggestVideoDuration` o una durata esplicita.
export const DEFAULT_VIDEO_DURATION = 13;
/** I gradini offerti in Settings e nella barra della tela — stessa fonte, `video-models.ts`. */
export function videoDurationOptions(model?: string | null): number[] {
  return sharedVideoDurationOptions(model?.trim() || envModelI2V());
}

/**
 * Nella finestra del modello SCELTO, e basta. Il minimo e il tetto vengono ENTRAMBI da
 * `videoModelCaps(model)` — mai una env var, mai una costante globale.
 *
 * C'era un pavimento di prodotto a 10 secondi che vinceva sul minimo dichiarato dal modello, e ha
 * fatto pagare 10 secondi a chi ne aveva chiesti 5: i video si fatturano al secondo, quindi era il
 * doppio, in silenzio. Il catalogo pubblica `supported_durations` per modello e per `wan-3.0`
 * parte da 2.
 *
 * Un DEFAULT si puo' scavalcare, un PAVIMENTO no — ed e' la differenza che questo cambio ripristina.
 * Chi non chiede niente riceve `DEFAULT_VIDEO_DURATION`, che non e' stato toccato; chi chiede una
 * durata la ottiene, se il modello la sa fare.
 */
export function clampVideoDuration(seconds: unknown, model?: string | null): number {
  const caps = videoModelCaps(model?.trim() || envModelI2V());
  const floor = caps.minDuration;
  const fallback = Math.min(Math.max(DEFAULT_VIDEO_DURATION, floor), caps.maxDuration);
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(caps.maxDuration, Math.max(floor, n));
}

/** Word count for spoken-line duration math (collapsed whitespace). */
export function spokenWordCount(script: string | null | undefined): number {
  return String(script ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean).length;
}

/**
 * La durata dal copione parlato. Il gradino più CORTO che regge tutte le parole, mai quello vicino
 * ma troppo breve: quello tronca a metà frase.
 */
export function suggestVideoDuration(script: string | null | undefined, model?: string | null): number {
  // Il pavimento di PRODOTTO (MIN_DURATION), non il minimo grezzo del provider: `videoDurationOptions`
  // oggi elenca ogni secondo della finestra del modello (per il selettore della tela), e il suo
  // primo valore può essere 1 — sotto il pavimento sotto cui una clip non regge hook→body→cta.
  const optsList = videoDurationOptions(model).filter((s) => s >= MIN_DURATION);
  const floor = optsList[0] ?? MIN_DURATION;
  const words = spokenWordCount(script);
  if (!words) return floor;
  if (!optsList.length) return clampVideoDuration(Math.ceil(words / (WORDS_PER_SECOND * SCRIPT_FIT_RATIO)), model);
  const fitting = optsList.find((s) => maxWordsForDuration(s) >= words);
  if (fitting != null) return fitting;
  // Copione più lungo del tetto: si usa il massimo, e `fitScriptToDuration` taglia.
  return optsList[optsList.length - 1]!;
}

/**
 * Richiesta esplicita → suggerimento dal copione → ultima spiaggia. Una preferenza di Settings si
 * passa come `requested`. Una durata esplicita troppo corta per il parlato CRESCE fino a
 * `suggestVideoDuration` invece di troncare.
 */
export function resolveVideoDuration(
  requested: unknown,
  script: string | null | undefined,
  model?: string | null
): number {
  const hasScript = spokenWordCount(script) > 0;

  if (requested != null && requested !== '' && Number.isFinite(Number(requested))) {
    const clamped = clampVideoDuration(requested, model);
    if (!hasScript) return clamped;
    if (spokenWordCount(script) <= maxWordsForDuration(clamped)) return clamped;
    return suggestVideoDuration(script, model);
  }
  if (hasScript) return suggestVideoDuration(script, model);
  return clampVideoDuration(undefined, model);
}

/** Pick an aspect ratio the active model accepts; unknown → 9:16. */
export function clampVideoAspectRatio(ratio: unknown, model?: string | null): string {
  const caps = videoModelCaps(model?.trim() || envModelI2V());
  const requested = String(ratio ?? '9:16').trim();
  return (caps.ratios as readonly string[]).includes(requested) ? requested : '9:16';
}

// L'upscale gira DENTRO il percorso di pubblicazione, con un utente che aspetta: budget molto più
// stretto della generazione, e sforarlo costa solo la risoluzione di bozza, mai il post.
// ponytail: bounded by wall-clock inside the request; if bulk approves with many clips start
// timing out, move the upscale to a `videos/work` cron like knowledge already uses.
const UPSCALE_TIMEOUT_MS = 60000;

/**
 * Il cancello dei crediti di CHI paga questo scope: il brand quando c'è, l'organizzazione quando
 * nessun brand è stato nominato. Scritto una volta perché i tre punti che spendono qui sotto
 * facevano la stessa domanda, e uno solo dei tre che dimentica l'organizzazione è una clip pagata
 * da un saldo che nessuno ha guardato.
 *
 * L'import dinamico evita il ciclo crediti↔ai-log.
 */
async function gateScopedCredits(): Promise<void> {
  const brandId = getBrandContext();
  const orgId = brandId ? null : getOrgContext();
  if (!brandId && !orgId) return;

  const { gateCredits, gateOrgCredits } = await import('$lib/server/credits');
  await (brandId ? gateCredits(brandId) : gateOrgCredits(orgId as string));
}

export type RenderVideoOpts = {
  // Desired clip length in seconds. Clamped into the CHOSEN model's supported window.
  duration?: number;
  // Social video is vertical-first, so we default to 9:16 (Reels/TikTok/Shorts).
  aspectRatio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '2:3' | '3:2' | 'adaptive';
  // Presente → IMAGE-TO-VIDEO: la cover fissa soggetto, scena e stile, e il prompt dirige solo il
  // movimento.
  imageUrl?: string;
  // Brand's free-text clip direction (content_prefs.videoInstructions, Settings → Video).
  instructions?: string | null;
  // Solo nel prompt di ripiego TEXT-TO-VIDEO: con una cover allegata lo stile è già nei pixel.
  visualStyle?: string | null;
  // Font dei sottotitoli impressi: quello del brand vale solo se libass ce l'ha sull'host di render.
  captionFont?: string;
  // Presente → clip PARLATA: audio e lip-sync nativi si pilotano CITANDO la riga dentro il prompt.
  // Assente → b-roll muto.
  script?: string | null;
  // Shipping resolution from the brand's Settings → Video ('480p' | '720p'). Unset → 480p.
  resolution?: string | null;
  /**
   * AI-authored creative brief for THIS clip. When set, replaces the hardcoded cinematic MOTION
   * template — chat can fully direct camera, energy, genre. Safety rails (clean frame, spoken
   * line lock, cover anchor) still apply.
   */
  prompt?: string | null;
  // Model id override (brand Settings → Video, or an AI tool choice). Unset → env default.
  // Duration is clamped against THIS model's caps, not a global ceiling.
  /** Le preferenze del brand: `resolveVideoModel` ne legge quella del mestiere che questo job e'. */
  prefs?: Record<string, unknown> | null;
  model?: string | null;
  /** Seedance first-frame URL (alias of imageUrl when both set — firstFrameUrl wins). */
  firstFrameUrl?: string | null;
  /** Seedance last-frame URL — requires a first frame. Ignored in reference-to-video mode. */
  lastFrameUrl?: string | null;
  /** Seedance multimodal reference videos (public URLs). Max 10 on Seedance 2.5. */
  referenceVideoUrls?: string[] | null;
  /** Seedance multimodal reference audios (public URLs). Max 10 on Seedance 2.5. */
  referenceAudioUrls?: string[] | null;
  /** Seedance multimodal reference images (public URLs). Max 30 on Seedance 2.5. */
  referenceImageUrls?: string[] | null;
  /**
   * Caller's cancellation. A clip render is the longest thing this codebase waits on — pass the
   * turn's signal so a stopped chat (or one out of budget) stops polling instead of holding the
   * invocation open for the whole wait.
   */
  abortSignal?: AbortSignal;
  /**
   * Override burned-in (ffmpeg) captions. Default: !!script.
   * Remakes of existing reels pass false so a script rewrite cannot add subtitles the original
   * clip never had.
   */
  burnCaptions?: boolean;
  /** I campi extra dichiarati dal modello scelto (`ai_models.param_schema`) — `generate_audio`,
   *  `seed`… Già filtrati a monte (`model-params.ts::extraParamsOf`). */
  params?: Record<string, unknown>;
};

// Ritmo veloce da short form: a 2.0 parole/s la recitazione esce lenta e strascicata, che nessuno
// usa sui social. Fit e suggest lasciano comunque un margine perché la riga finisca.
export const WORDS_PER_SECOND = 3.5;

/** Il resto è un battito dopo l'ultima parola. */
export const SCRIPT_FIT_RATIO = 0.92;

/** Max spoken words that fit in `seconds` without audibly truncating. */
export function maxWordsForDuration(seconds: number): number {
  return Math.max(1, Math.floor(seconds * WORDS_PER_SECOND * SCRIPT_FIT_RATIO));
}

/**
 * Guide di pronuncia per i nomi che il TTS storpia. FUORI dalla riga citata, o il lip-sync perde
 * l'ortografia: la citazione fissa le lettere, questa fissa il suono.
 */
export function brandPronunciationHints(script: string | null | undefined): string {
  const text = String(script ?? '');
  if (!/\bfeega\b/i.test(text)) return '';
  return [
    'PRONUNCIATION — Italian brand name, even if the rest of the line is English:',
    '"feega" = ah-no-MAH-lyah (Italian /anoˈmalja/, stress on MA, final "lia" as one soft "lyah").',
    'NOT English "anomaly". NEVER Anomida, Anonimita, Annanomita, Anonimia, or Anomaly-uh.'
  ].join(' ');
}

// Un confine di frase dentro la finestra, così non si spedisce mai una proposizione mozzata;
// altrimenti un confine di parola.
export function fitScriptToDuration(script: string, seconds: number): string {
  const words = script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const max = maxWordsForDuration(seconds);
  if (words.length <= max) return words.join(' ');
  const cut = words.slice(0, max);
  for (let i = cut.length - 1; i >= Math.max(1, Math.floor(cut.length * 0.5)); i--) {
    if (/[.!?]"?$/.test(cut[i])) return cut.slice(0, i + 1).join(' ');
  }
  return cut.join(' ');
}

/**
 * La regola che sopravanza tutte le altre, e per questo chiude sempre il prompt. È una costante
 * perché `buildVideoPrompt` deve poterla riconoscere in coda per infilarci il craft PRIMA: una
 * nota di mestiere dopo questa riga la farebbe sembrare negoziabile.
 */
const CLEAN_FRAME_RULE =
  'ABSOLUTE RULE — CLEAN FRAME: NO text anywhere in the video. No subtitles, no captions, no burned-in words, no lower thirds, no titles, no watermark, no UI overlay, no emoji, no logo. Every pixel is photographic. This outranks every other instruction: even though there is spoken dialogue, do NOT add subtitles.';

// L'`image_prompt` salvato descrive uno STILL: mandarlo verbatim produce clip generiche che
// reimmaginano la scena da capo. L'image-to-video vuole un brief di MOVIMENTO ancorato alla cover;
// il text-to-video vuole la scena PIÙ la direzione di movimento e lo stile del brand.
//
// Due modi creativi, vince il primo: `prompt` esplicito → freeform; altrimenti cinematografico
// leggero. Le protezioni (frame pulito, riga parlata bloccata) valgono sempre quando c'è dialogo.
/**
 * Il prompt, più le note del modello che lo renderà.
 *
 * Le note entrano QUI e non dentro i quattro rami di `composeVideoPrompt`: ripeterle in ognuno
 * significherebbe quattro punti da aggiornare al prossimo modello, e il quarto verrebbe
 * dimenticato. Vanno in coda perché la scena resta la prima cosa che il modello legge, e prima
 * della regola del fotogramma pulito, che è l'ultima parola su tutto.
 */
export function buildVideoPrompt(
  imagePrompt: string,
  opts: Parameters<typeof composeVideoPrompt>[1] = { hasCover: false }
): string {
  const body = composeVideoPrompt(imagePrompt, opts);
  const craft = videoCraftFor(opts.model);
  if (!craft) {
    return body;
  }
  // La regola del fotogramma pulito chiude il prompt anche quando c'è il craft: è l'unica che
  // sopravanza tutto, e una nota di mestiere messa dopo la farebbe sembrare negoziabile.
  const clean = CLEAN_FRAME_RULE;
  return body.endsWith(clean) ? `${body.slice(0, -clean.length)}${craft}\n\n${clean}` : `${body}\n\n${craft}`;
}

function composeVideoPrompt(
  imagePrompt: string,
  opts: {
    hasCover: boolean;
    visualStyle?: string | null;
    script?: string | null;
    /** Brand / AI free-text clip direction. Trimmed to the stored ceiling. */
    instructions?: string | null;
    /**
     * AI-authored creative brief. When non-empty, replaces the hardcoded cinematic MOTION
     * template so chat can choose look, camera, energy freely.
     */
    prompt?: string | null;
    /**
     * Il modello che renderà la clip. Serve SOLO a scegliere le note di mestiere: i modelli
     * sbagliano cose diverse (Seedance aggiunge watermark, Grok ignora le esclusioni, Kling
     * fonde i personaggi senza etichette) e un prompt uguale per tutti è scritto bene per
     * nessuno. Il registro sta in `$lib/design/video-craft`, non in un `if` qui dentro.
     */
    model?: string | null;
  } = { hasCover: false }
): string {
  const scene = imagePrompt.replace(/\s+/g, ' ').trim().slice(0, 600);
  const line = opts.script?.replace(/\s+/g, ' ').trim() ?? '';
  const free = opts.prompt?.trim().replace(/\s+/g, ' ').slice(0, 1200) ?? '';
  // Indirizzo morbido: in freeform il prompt AI è primario, questo si aggiunge.
  const brandDirection = opts.instructions?.trim()
    ? `${free ? 'EXTRA DIRECTION' : 'BRAND DIRECTION'} (follow for delivery, energy and behaviour on camera, but never at the cost of the clean-frame rule): ${opts.instructions.trim().replace(/\s+/g, ' ').slice(0, 600)}`
    : '';
  const clean = CLEAN_FRAME_RULE;
  const speech = line
    ? `SPOKEN LINE — the person says exactly this, and nothing else: "${line}"`
    : '';
  const pronunciation = brandPronunciationHints(line);

  // FREEFORM: il brief l'ha scritto l'AI, niente template. Unica eccezione, la protezione che
  // impone di finire ogni parola.
  if (free) {
    const anchor = opts.hasCover
      ? `The attached photograph is the first frame. Keep subject identity, wardrobe and location unless the brief below says otherwise. Framing: chest-up with clear headroom above the hair — never crop the top of the head.\nSCENE (from the cover — do not invent a different subject): ${scene}`
      : `Photorealistic short social-media clip: ${scene}${
          opts.visualStyle?.trim()
            ? `\n\nBRAND VISUAL STYLE to match: ${opts.visualStyle.trim().replace(/\s+/g, ' ').slice(0, 500)}`
            : ''
        }`;
    return [
      clean,
      anchor,
      `CREATIVE BRIEF (follow this — it overrides the default motion template):\n${free}`,
      speech,
      pronunciation,
      brandDirection,
      // Il frame pulito si ripete per ultimo: col dialogo il modello tende ai sottotitoli.
      line || free ? clean : ''
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  // Una clip parlata ha bisogno che le LABBRA si muovano: il brief da b-roll muto permette solo
  // movimento ambientale e combatterebbe il dialogo.
  const motion = line
    ? 'MOTION: the person in frame speaks the line below directly to camera, with natural lip-sync, facial expression and small head movement. Keep the camera nearly still (at most a very slow push-in). No rapid cuts, no zoom bursts, no shaky handheld.'
    : 'MOTION: one subtle, cinematic camera move that fits the scene (slow push-in, gentle pan or soft parallax) plus natural in-scene motion only where believable (light shifting, steam rising, fabric or hair moving, a hand adjusting the product). Calm, controlled pacing — no rapid cuts, no zoom bursts, no shaky handheld.';
  // I sottotitoli sono affare NOSTRO (font del brand, ortografia giusta), mai del modello: storpia
  // le lettere e la storpiatura cambia da frame a frame.
  const fidelity =
    'FIDELITY: keep the subject, composition, colours and materials faithful for the entire clip. No morphing or warping, no scene change, no new objects or people appearing, no on-screen text or logos, no flicker.';
  // Citare la riga verbatim è il modo documentato di pilotare l'audio nativo. Nient'altro può
  // essere pronunciato: senza il vincolo il modello improvvisa dialogo sopra il messaggio del brand.
  const speechBlock = line
    ? `${speech}${pronunciation ? `\n${pronunciation}` : ''}\nNatural, conversational delivery that suits the scene. No voice-over narrator, no other speech, no background dialogue.`
    : '';
  if (opts.hasCover) {
    return [
      'Animate the attached image into a short, premium social-media clip.',
      `SCENE (already fixed by the attached image — do not change it): ${scene}`,
      motion,
      speechBlock,
      fidelity,
      brandDirection
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  const style = opts.visualStyle?.trim()
    ? `\n\nBRAND VISUAL STYLE to match: ${opts.visualStyle.trim().replace(/\s+/g, ' ').slice(0, 500)}`
    : '';
  return [`Photorealistic, premium short social-media clip: ${scene}`, motion, speechBlock, `${fidelity}${style}`, brandDirection]
    .filter(Boolean)
    .join('\n\n');
}

export type RenderedVideo = {
  // Storage path of the persisted mp4 in `brand-knowledge`, signed on read.
  url: string;
  // La fatturazione è al secondo: è l'unità su cui si riconcilia la spesa.
  durationSeconds: number;
  // L'unico appiglio che upscale/extend accettano: va persistito.
  taskId: string;
  // Resolution the stored mp4 is at, so the publish path knows whether it still needs upscaling.
  resolution: string;
  // La cover da cui la clip è stata animata: è il poster nel feed, l'ancora di stile per
  // "rigenera cambiando X" e l'input di un nuovo render. undefined solo per il text-to-video.
  thumbnailUrl?: string;
};

async function runVideoJob(
  model: string,
  prompt: string,
  durationSeconds: number,
  aspectRatio: string,
  resolution: string,
  opts: {
    imageUrl?: string;
    lastFrameUrl?: string;
    referenceVideoUrls?: string[];
    referenceAudioUrls?: string[];
    referenceImageUrls?: string[];
    abortSignal?: AbortSignal;
  } = {}
): Promise<(VideoJobResult & { costUsd?: number }) | undefined> {
  const out = await renderOpenrouterVideo(
    {
      model,
      prompt,
      durationSeconds,
      resolution,
      aspectRatio,
      imageUrl: opts.imageUrl,
      lastFrameUrl: opts.lastFrameUrl,
      referenceImageUrls: opts.referenceImageUrls,
      referenceAudioUrls: opts.referenceAudioUrls,
      referenceVideoUrls: opts.referenceVideoUrls
    },
    { signal: opts.abortSignal, context: 'inline' }
  );
  // Una scadenza non riapre niente: il job resta del fornitore col suo id.
  if (out.status !== 'done') return undefined;

  return { url: out.url, taskId: tagOpenrouterJob(out.jobId), costUsd: out.costUsd };
}

// Gli URL del fornitore non sono permanenti. La RLS dello Storage pretende che il primo segmento
// del path sia `auth.uid()`, quindi ogni oggetto vive sotto `{userId}/…`. Ritorna il PERCORSO nel
// bucket, non un URL: `brand-knowledge` è privato, e chi legge firma al momento della lettura
// (`signKnowledgePaths`), come già ogni altro asset `generated` sulla tela.
async function persistMp4(
  supabase: SupabaseClient,
  userId: string,
  srcUrl: string,
  opts: { captions?: boolean; fontName?: string; tighten?: boolean; headers?: Record<string, string> } = {}
): Promise<string | undefined> {
  const dl = await fetch(srcUrl, opts.headers ? { headers: opts.headers } : undefined);
  if (!dl.ok) return undefined;
  let bytes: Buffer = Buffer.from(await dl.arrayBuffer());
  // Il vuoto in testa e in coda si taglia PRIMA dei sottotitoli, o il timing non corrisponde al
  // montaggio spedito. Le micro-pause interne restano: sono il mestiere.
  if (opts.tighten !== false) {
    const { tightenDeadSpace } = await import('$lib/server/video-edit');
    bytes = await tightenDeadSpace(bytes);
  }
  // Impressi PRIMA dell'upload, così lo Storage tiene solo il montaggio spedibile: una clip
  // parlata la guarda muta la maggior parte del pubblico.
  if (opts.captions) {
    const { burnCaptions } = await import('$lib/server/captions');
    bytes = await burnCaptions(bytes, { fontName: opts.fontName });
  }
  // AI Act Art. 50(2): il montaggio spedibile va marcato come sintetico. Stream copy, zero costo
  // di qualità, e un tag fallito restituisce la clip intatta invece di perderla.
  {
    const { markVideoSynthetic } = await import('$lib/server/content-credentials');
    bytes = await markVideoSynthetic(bytes);
  }
  const path = `${userId}/generated/${crypto.randomUUID()}.mp4`;
  const { error } = await supabase.storage.from('brand-knowledge').upload(path, bytes, {
    contentType: 'video/mp4',
    upsert: false
  });
  if (error) return undefined;
  return path;
}

/**
 * Tutto ciò che va deciso prima di parlare al fornitore: modello, durata, prompt, e le opzioni che
 * serviranno a finire il lavoro molto dopo che questa richiesta sarà finita.
 *
 * Separato perché un render si può attendere inline o consegnare a un riconciliatore: le decisioni
 * sono le stesse, cambia solo l'attesa, e duplicarle è il modo in cui i due percorsi divergono.
 */
type PreparedRender = {
  model: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  cover?: string;
  script?: string;
  lastFrame?: string;
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
  referenceImageUrls: string[];
  persistOpts: VideoPersistOpts;
  params?: Record<string, unknown>;
};

/** What persistMp4 needs, kept whole because the request that computed it will not exist later. */
export type VideoPersistOpts = {
  captions: boolean;
  fontName?: string;
  tighten: boolean;
};

export async function renderVideo(
  supabase: SupabaseClient,
  userId: string,
  imagePrompt: string,
  opts: RenderVideoOpts = {}
): Promise<RenderedVideo | undefined> {
  const prepared = await prepareVideoRender(imagePrompt, opts);
  return runPreparedRender(supabase, userId, prepared, opts.abortSignal);
}

/**
 * Esportata per il test, non per i chiamanti: `renderVideo` resta l'unica porta. Senza, il punto
 * in cui il modello risolto incontra il prompt non lo verifica nessuno — ed è esattamente il tipo
 * di cavo che si stacca in silenzio, come è successo al pavimento del craft delle immagini.
 */
export async function prepareVideoRender(
  imagePrompt: string,
  opts: RenderVideoOpts = {}
): Promise<PreparedRender> {
  // NESSUN CANCELLO DI FORNITORE QUI: la chiave si controlla dove si usa, nel trasporto.

  // Una clip è la cosa più cara che il motore possa comprare: chi ha i crediti esauriti non deve
  // poterci spendere da NESSUN percorso. `CreditsExhaustedError` si propaga — l'utente deve sapere
  // che è a secco, non vedere una cover come se il modello avesse fallito.
  await gateScopedCredits();

  // `image_urls` / `first_frame_url` accettano solo still: un post che porta già una clip non deve
  // finire lì dentro come riferimento immagine.
  const firstFrameRaw = opts.firstFrameUrl?.trim() || opts.imageUrl?.trim() || undefined;
  const cover = firstFrameRaw && !isVideoUrl(firstFrameRaw) ? firstFrameRaw : undefined;
  const lastFrameRaw = opts.lastFrameUrl?.trim() || undefined;
  const lastFrame = lastFrameRaw && !isVideoUrl(lastFrameRaw) ? lastFrameRaw : undefined;
  const referenceVideoUrls = (opts.referenceVideoUrls ?? []).map((u) => u.trim()).filter(Boolean);
  const referenceAudioUrls = (opts.referenceAudioUrls ?? []).map((u) => u.trim()).filter(Boolean);
  const referenceImageUrls = (opts.referenceImageUrls ?? []).map((u) => u.trim()).filter(Boolean);
  const hasRefs =
    referenceVideoUrls.length > 0 || referenceAudioUrls.length > 0 || referenceImageUrls.length > 0;
  // Prima il modello: i tetti di durata e ratio sono proprietà di QUESTO modello, non globali.
  const model = resolveVideoModel({ model: opts.model, prefs: opts.prefs, hasCover: !!cover || hasRefs });

  const durationSeconds = resolveVideoDuration(opts.duration, opts.script, model);
  const aspectRatio = clampVideoAspectRatio(opts.aspectRatio ?? '9:16', model);

  const resolution = clampVideoResolution(opts.resolution ?? DEFAULT_RESOLUTION);
  // Si taglia solo se il copione supera ancora la durata dopo la risoluzione.
  const script = opts.script?.trim() ? fitScriptToDuration(opts.script, durationSeconds) : undefined;
  const prompt = buildVideoPrompt(imagePrompt, {
    hasCover: !!cover || hasRefs,
    visualStyle: opts.visualStyle,
    script,
    instructions: opts.instructions,
    prompt: opts.prompt,
    durationSeconds,
    // Il modello è già stato risolto sopra: le note di mestiere sono sue, non del brief.
    model
  });

  return {
    model,
    prompt,
    durationSeconds,
    aspectRatio,
    resolution,
    cover,
    script,
    lastFrame,
    referenceVideoUrls,
    referenceAudioUrls,
    referenceImageUrls,
    params: opts.params,
    persistOpts: {
      captions: opts.burnCaptions !== undefined ? !!opts.burnCaptions && !!script : !!script,
      fontName: opts.captionFont,
      // Il taglio del vuoto vale su ogni clip parlata; il b-roll muto si lascia stare.
      tighten: !!script
    }
  };
}

/** Il percorso inline: invia, aspetta, persiste. */
async function runPreparedRender(
  supabase: SupabaseClient,
  userId: string,
  p: PreparedRender,
  abortSignal?: AbortSignal
): Promise<RenderedVideo | undefined> {
  const { model, prompt, durationSeconds, aspectRatio, resolution, cover, lastFrame } = p;
  const { referenceVideoUrls, referenceAudioUrls, referenceImageUrls } = p;
  try {
    // La riga in `ai_calls` la scrive il trasporto, che e' l'unico a conoscere il `jobId` e il
    // costo fatturato — anche quando il job e' SCADUTO e qui non arriva.
    const job = await runVideoJob(model, prompt, durationSeconds, aspectRatio, resolution, {
      imageUrl: cover,
      lastFrameUrl: lastFrame,
      referenceVideoUrls,
      referenceAudioUrls,
      referenceImageUrls,
      abortSignal
    });
    if (!job) return undefined;

    const url = await persistMp4(supabase, userId, job.url, {
      ...p.persistOpts,
      headers: openrouterVideoHeaders()
    });
    if (!url) return undefined;
    // taskId e risoluzione tornano indietro perché sono ciò che rende possibile l'upscale
    // all'approvazione senza rigenerare la clip. `thumbnailUrl` è la COVER: senza restituirla il
    // chiamante sovrascrive media_url con la clip e il frame è perso, con tutto il grounding
    // (prodotto, identità, palette, QC) che c'era dentro.
    return { url, durationSeconds, taskId: job.taskId, resolution, thumbnailUrl: cover };
  } catch {
    // Non fatale: il chiamante ripiega sulla cover.
    return undefined;
  }
}

/**
 * I due mestieri che partono da un video che esiste gia\'.
 *
 * Tornano `undefined` e non lanciano, come ogni altro render qui: una clip che non riesce non deve
 * portarsi via il post da cui e\' partita.
 *
 * La clip finita si RIOSPITA (`persistMp4`): gli URL dei provider scadono, e un post che punta a un
 * URL scaduto e\' un post senza video, mesi dopo, senza un errore da nessuna parte.
 */
export async function transformVideo(opts: {
  supabase: SupabaseClient;
  userId: string;
  role: VideoRole & ('refine' | 'motion');
  videoUrl: string;
  prompt?: string;
  imageUrl?: string;
  aspectRatio?: string;
  mode?: 'std' | 'pro';
  model?: string | null;
  prefs?: Record<string, unknown> | null;
  abortSignal?: AbortSignal;
}): Promise<{ url: string; taskId: string; model: string } | undefined> {
  const model = opts.model?.trim() || videoModelForRole(opts.prefs, opts.role);
  if (!model) return undefined;

  // Un modello che non dichiara questo mestiere non deve raggiungere il fornitore: sarebbe un
  // giro pagato che non torna nulla.
  if (!videoModelSpec(model)?.roles.includes(opts.role)) {
    throw new Error(`${model} does not do ${opts.role}: pick a model that serves that job`);
  }

  await gateScopedCredits();

  let job: VideoJobResult | undefined;
  try {
    const out = await renderOpenrouterVideo(
      {
        model,
        prompt: opts.prompt ?? '',
        durationSeconds: 0,
        resolution: '',
        aspectRatio: opts.aspectRatio ?? '',
        // Il video sorgente è un RIFERIMENTO, non un fotogramma: `frame_images` direbbe
        // «parti da questa immagine», che è un altro mestiere.
        referenceVideoUrls: [opts.videoUrl],
        ...(opts.imageUrl ? { referenceImageUrls: [opts.imageUrl] } : {})
      },
      { signal: opts.abortSignal, context: `transform:${opts.role}`, label: 'video.transform' }
    );
    if (out.status === 'done') job = { url: out.url, taskId: tagOpenrouterJob(out.jobId) };
  } catch (e) {
    console.error('[video.transform] job failed', e);
  }
  if (!job) return undefined;

  // Niente sottotitoli e niente taglio: la clip di partenza e\' gia\' montata, e rimontarla qui
  // sposterebbe il timing di quello che l\'utente ha approvato.
  const url = await persistMp4(opts.supabase, opts.userId, job.url, {
    captions: false,
    tighten: false,
    headers: openrouterVideoHeaders()
  });
  if (!url) return undefined;
  return { url, taskId: job.taskId, model };
}

/** A render the provider has accepted but not finished. Everything here must survive the request. */
export type SubmittedVideoRender = {
  taskId: string;
  model: string;
  prompt: string;
  durationSeconds: number;
  resolution: string;
  coverUrl?: string;
  persistOpts: VideoPersistOpts;
  /** Epoch ms all'invio: è come il registro sa quanto la clip ha davvero impiegato. */
  submittedAt: number;
};

/**
 * Consegna il job e si ferma. L'attesa che fa `renderVideo` non compra niente: il task id è un
 * appiglio durevole e il risultato resta recuperabile da qualunque processo — tenere aperta
 * un'invocazione a guardare la coda di qualcun altro è ciò che rendeva la generazione la cosa più
 * lunga del repo, e ciò che la limitava al tetto dell'attesa comunque.
 *
 * I crediti si GATANO qui ma non si fatturano: il costo esatto arriva solo col job finito, quindi
 * l'addebito cade in `finishVideoRender` e un job che non riesce non si paga.
 */
export async function submitVideoRender(
  imagePrompt: string,
  opts: RenderVideoOpts = {}
): Promise<SubmittedVideoRender | undefined> {
  const p = await prepareVideoRender(imagePrompt, opts);

  // Same contract as the inline path: a provider or network failure is non-fatal and returns
  // undefined so the caller ships the cover. Without this a blip unwinds into the caller's outer
  // catch and takes the whole post with it — including the cover image already generated and paid
  // for. CreditsExhaustedError is re-thrown: that is a message for the user, not a render failure.
  let jobId: string | undefined;
  try {
    // Si INVIA e basta: il poll lo fara' il riconciliatore, sullo stesso id, quante volte serve.
    const out = await submitOpenrouterVideo(
      {
        model: p.model,
        prompt: p.prompt,
        durationSeconds: p.durationSeconds,
        resolution: p.resolution,
        aspectRatio: p.aspectRatio,
        imageUrl: p.cover,
        lastFrameUrl: p.lastFrame,
        // Come sul percorso inline: senza, una clip inviata in asincrono perde l'ancoraggio ai
        // riferimenti e nessuno se ne accorge finché non la guarda.
        referenceImageUrls: p.referenceImageUrls,
        referenceAudioUrls: p.referenceAudioUrls,
        referenceVideoUrls: p.referenceVideoUrls,
        params: p.params
      },
      opts.abortSignal
    );
    if (!out.jobId) {
      // Il motivo esisteva gia' qui e moriva nel log: chi ha chiamato il tool riceveva
      // `render_failed` nudo e non poteva sapere se riprovare o cambiare parametro.
      console.error(`[video] submit openrouter rifiutato: ${out.error}`);
      if (out.error) opts.onSubmitError?.(String(out.error));
      return undefined;
    }
    jobId = out.jobId;
  } catch (e) {
    if (e instanceof Error && e.name === 'CreditsExhaustedError') throw e;
    const why = e instanceof Error ? e.message : String(e);
    console.error('[video] submit failed:', why);
    opts.onSubmitError?.(why);
    return undefined;
  }

  return {
    taskId: tagOpenrouterJob(jobId),
    model: p.model,
    prompt: p.prompt,
    durationSeconds: p.durationSeconds,
    resolution: p.resolution,
    coverUrl: p.cover,
    persistOpts: p.persistOpts,
    submittedAt: Date.now()
  };
}

export type VideoRenderOutcome =
  /** Il fornitore sta ancora lavorando. Ask again later; nothing is held open in the meantime. */
  | { status: 'pending' }
  | { status: 'done'; url: string; durationSeconds: number; resolution: string; thumbnailUrl?: string }
  | { status: 'failed'; error: string; retryable?: boolean };

/**
 * Check a submitted render once, and finish it if the provider is done.
 *
 * One call — no loop, no sleep, no budget. That is the whole point: the caller can be a cron tick
 * costing milliseconds instead of a process sitting on a ten-minute timer.
 */
export async function finishVideoRender(
  supabase: SupabaseClient,
  userId: string,
  submitted: SubmittedVideoRender
): Promise<VideoRenderOutcome> {
  // CHI interrogare lo dice la RIGA, mai la configurazione di adesso: una clip consegnata prima di
  // un deploy deve restare recuperabile da chi l'ha presa in carico.
  const openrouterJobId = untagOpenrouterJob(submitted.taskId);
  if (!openrouterJobId) {
    // Una riga storica di un trasporto che non esiste piu'. Dirlo subito la chiude; restare
    // `pending` la lascerebbe girare nel riconciliatore fino alla finestra di resa.
    return { status: 'failed', error: 'no transport can resolve this task id' };
  }

  return finishOpenrouterRender(supabase, userId, submitted, openrouterJobId);
}

/**
 * L'altra meta' di `finishVideoRender`, per i job che vivono su OpenRouter.
 *
 * Una interrogazione sola, mai un ciclo: `pending` vuol dire "richiedi al giro dopo", e nessun
 * secondo invio parte da qui — il job e' gia' del fornitore, e riaprirlo lo pagherebbe due volte.
 */
async function finishOpenrouterRender(
  supabase: SupabaseClient,
  userId: string,
  submitted: SubmittedVideoRender,
  jobId: string
): Promise<VideoRenderOutcome> {
  const outcome = await checkOpenrouterVideo(jobId);
  if (outcome.status === 'pending') return { status: 'pending' };
  if (outcome.status === 'failed') return { status: 'failed', error: outcome.error };
  if (outcome.status === 'timeout') return { status: 'pending' };

  // Si RIOSPITA prima e si fattura dopo: il download puo' fallire, e chi ci richiama e' un cron.
  const url = await persistMp4(supabase, userId, outcome.url, {
    ...submitted.persistOpts,
    headers: openrouterVideoHeaders()
  });
  if (!url) return { status: 'failed', error: 'clip rendered but could not be stored', retryable: true };

  logAiCall({
    label: 'video.render',
    provider: 'openrouter',
    model: openrouterVideoModel(submitted.model),
    prompt: submitted.prompt,
    ms: Math.max(0, Date.now() - submitted.submittedAt),
    ok: true,
    // Ignoto non e' zero: se OpenRouter non riporta il costo, la riga lo dice invece di inventarlo.
    ...(outcome.costUsd != null ? { flatCostUsd: outcome.costUsd } : {}),
    context: `${submitted.durationSeconds}s ${submitted.resolution} (async) · job ${jobId}`
  });

  return {
    status: 'done',
    url,
    durationSeconds: submitted.durationSeconds,
    resolution: submitted.resolution,
    thumbnailUrl: submitted.coverUrl
  };
}

// Re-render an ALREADY GENERATED clip at a higher resolution, without paying to generate it again.
//
// This is the second half of the cost strategy: drafts render at RESOLUTION (cheap), and only the
// clips a user actually approves are upscaled. Most drafts are never published, so the expensive
// resolution is paid on a fraction of them.
//
// Returns undefined on ANY failure — no clip file, provider refusal, timeout, storage error — and
// the caller keeps publishing the draft-resolution clip. A worse pixel count must never cost a post.
export async function upscaleVideo(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  resolution: string = UPSCALE_RESOLUTION,
  opts: { videoUrl?: string } = {}
): Promise<{ url: string; resolution: string } | undefined> {
  if (!taskId) return undefined;

  // `black-forest-labs/flux-video-upscale` riparte dal FILE — «requires video input: include an
  // input_references entry of type video_url», risponde se manca. Chi chiama il file ce l'ha già
  // (`post.media_url`), quindi non c'è niente da conservare: senza quello non si ingrandisce.
  if (!opts.videoUrl) return undefined;

  return upscaleOnOpenrouter(supabase, userId, opts.videoUrl, resolution);
}

/**
 * Ingrandisce una clip su OpenRouter, partendo dal FILE.
 *
 * Nessun `task_id` da conservare e nessun fornitore da interrogare sul lavoro di prima: si manda
 * il video e si riceve il video. `renderOpenrouterVideo` fa già invio, attesa e costo — qui resta
 * solo la forma dell'ingresso, che per questo modello è obbligatoria.
 */
async function upscaleOnOpenrouter(
  supabase: SupabaseClient,
  userId: string,
  videoUrl: string,
  resolution: string
): Promise<{ url: string; resolution: string } | undefined> {
  try {
    await gateScopedCredits();
  } catch {
    return undefined;
  }

  const out = await renderOpenrouterVideo(
    {
      model: OPENROUTER_UPSCALE_MODEL,
      prompt: '',
      durationSeconds: 0,
      resolution,
      aspectRatio: '',
      referenceVideoUrls: [videoUrl]
    },
    { context: 'upscale', timeoutMs: UPSCALE_TIMEOUT_MS }
  );
  if (out.status !== 'done') return undefined;

  const url = await persistMp4(supabase, userId, out.url);
  return url ? { url, resolution } : undefined;
}
