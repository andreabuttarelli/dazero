import { requireBrandContext } from '$lib/server/ai-log';
import { env } from '$env/dynamic/private';
import { route } from '$lib/server/model-routing';
import {
  llmBaseUrl,
  llmConfigured,
  llmImagesFromInline,
  llmModels,
  llmStructured,
  llmText,
  reasoningEffort,
  type ReasoningEffort
} from '$lib/server/llm';

// ── Il centralino del testo ─────────────────────────────────────────────────
// Ogni chiamata di testo e di JSON del prodotto passa da qui e finisce sul gateway, che è l'unico
// posto dove il testo vive. Il file si chiamava `xiaomi.ts` e non parla con Xiaomi da mesi.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

// Parte immagine in linea, nel formato che ogni call site dell'app già costruisce.
export type ImagePart = { inlineData: { mimeType: string; data: string } };

/** Chi serve il testo DAVVERO, per la riga di avvio: la rotta di adesso, non una foto di prima. */
export function textRouteLabel(): string {
  if (!llmConfigured()) return 'not configured (LLM_API_KEY missing)';
  const host = llmBaseUrl().replace(/^https?:\/\//, '').split('/')[0];
  return `${host} (${llmModels().join(', ') || 'no model declared'})`;
}

// Extra fields threaded into logAiCall so per-site labels/attribution survive both providers.
export type AiLogExtras = { brandId?: string; userId?: string; threadId?: string; context?: string };

let warnedStaleBudget = false;

/**
 * Quanto ragiona ogni chiamata di giudizio / revisione / QC. Letta a ogni chiamata, così una
 * regressione si disinnesca cambiando la variabile invece che con un deploy.
 *
 * Stava in `gemini.ts` e si chiamava `judgeThinkingLevel`, nel vocabolario di Google — ma il valore
 * viaggia su `reasoning.effort` di OpenRouter, e da lì passa. Il nome vecchio prometteva
 * `thinkingLevel`, un campo che nessuna chiamata di questo prodotto manda più.
 *
 * Le vecchie *_THINKING_BUDGET numeriche sono morte: si avvisa una volta invece di lasciarle
 * sembrare vive nella configurazione.
 */
export function judgeReasoningEffort(rawOverride?: string | null): ReasoningEffort {
  if (!warnedStaleBudget && (env.GEMINI_JUDGE_THINKING_BUDGET || env.PREPUBLISH_THINKING_BUDGET)) {
    warnedStaleBudget = true;
    console.warn(
      '[AI] GEMINI_JUDGE_THINKING_BUDGET / PREPUBLISH_THINKING_BUDGET are ignored: the gateway takes ' +
        'reasoning.effort, not a token budget. Use GEMINI_JUDGE_THINKING_LEVEL=low|medium|high.'
    );
  }
  return reasoningEffort(rawOverride ?? env.GEMINI_JUDGE_THINKING_LEVEL);
}

/**
 * DeepSeek runs in `json_object` mode with the schema in the prompt — valid JSON is guaranteed,
 * conformance is NOT. So check what the caller actually depends on (top-level `required` keys, and
 * that arrays came back as arrays) and fall through to the previous provider when it doesn't hold.
 * Without this, a partially-filled object would be indistinguishable from a good one downstream.
 */
export function satisfiesSchema(value: unknown, schema: AnyRec): boolean {
  if (value == null) return false;
  if (schema?.type === 'array') return Array.isArray(value);
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as AnyRec;
  if (!Object.keys(obj).length) return false;
  const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
  for (const key of required) {
    if (obj[key] === undefined || obj[key] === null) return false;
    const expected = schema?.properties?.[key]?.type;
    if (expected === 'array' && !Array.isArray(obj[key])) return false;
    if (expected === 'object' && (typeof obj[key] !== 'object' || Array.isArray(obj[key]))) return false;
  }
  return true;
}

/**
 * La chiamata strutturata del prodotto. Un trasporto solo: quello che fallisce non ha un secondo
 * posto dove andare, e va detto invece che nascosto sotto un ripiego.
 *
 * `satisfiesSchema` resta, e non è cerimonia: il gateway chiede lo schema al server, ma un modello
 * può comunque rispondere con un oggetto che non lo rispetta, e un JSON valido ma della forma
 * sbagliata è il guasto che arriva più lontano prima di farsi notare.
 */
export async function aiStructured<T>(
  prompt: string,
  schema: AnyRec,
  systemInstruction?: string,
  toolName = 'return_result',
  opts?: {
    images?: ImagePart[];
    temperature?: number;
    model?: string;
    /** Lo sforzo di ragionamento per QUESTA chiamata. Assente = il default del gateway. */
    reasoningEffort?: ReasoningEffort;
  } & AiLogExtras
): Promise<T> {
  requireBrandContext(opts);
  const t0 = Date.now();
  const { images, temperature, model, reasoningEffort: effort } = opts ?? {};

  console.log(`[AI] structured call${opts?.model ? ` (${opts.model})` : ''}`);
  try {
    const result = await llmStructured<T>({
      prompt,
      schema,
      system: systemInstruction,
      images: llmImagesFromInline(images),
      temperature,
      model,
      reasoningEffort: effort,
      label: toolName
    });
    console.log(`[AI] llm responded in ${Date.now() - t0}ms`);
    return result;
  } catch (err) {
    console.error(`[AI] llm failed after ${Date.now() - t0}ms:`, err);
    throw err;
  }
}

// ── Free-text generation (non-structured) ────────────────────────────────────

// Testo libero, sul gateway.
export async function aiText(
  prompt: string,
  systemInstruction?: string,
  opts?: { label?: string; images?: ImagePart[] } & AiLogExtras
): Promise<string> {
  requireBrandContext(opts);
  const t0 = Date.now();
  const { label = 'text', images } = opts ?? {};

  const r = await llmText({
    prompt,
    system: systemInstruction,
    images: llmImagesFromInline(images),
    label
  });
  console.log(`[AI] llm text responded in ${Date.now() - t0}ms`);
  return r.text.trim();
}

// ── Parallel variants ───────────────────────────────────────────────────────
// Generate N variants in parallel, then pick the best via LLM comparison.

const DEFAULT_VARIANTS = 3;

// Positioning lenses assigned one-per-variant by the multi-variant planners (GTM roadmap,
// editorial plan). Without them the N "variants" share prompt AND sampling and collapse onto the
// same positioning/imagery run after run — the judge then just picks between near-clones. Each
// lens biases the strategic BET only; the brand facts and data always win over the lens.
export const VARIANT_LENSES = [
  'Lean COMMUNITY-LED: conversations, niche communities, user-generated content and direct engagement carry the growth.',
  'Lean PRODUCT/EDUCATION-LED: concrete use-cases, demos, how-tos and proof of capability carry the growth.',
  'Lean FOUNDER/AUTHORITY-LED: a personal voice, sharp opinions, behind-the-scenes and thought leadership carry the growth.'
];

// Sampling temperature for CREATIVE generation calls (plan/GTM variant proposals). Selection and
// judge calls stay at each provider's default — judging needs consistency, not exploration.
export const CREATIVE_TEMPERATURE = 0.9;

export async function parallelVariants<T>(
  // Receives the 0-based variant index so callers can differentiate each variant (lens, seed…).
  generateFn: (variantIndex: number) => Promise<T>,
  selectFn: (variants: T[]) => Promise<T>,
  count = DEFAULT_VARIANTS,
  label = 'plan'
): Promise<T> {
  console.log(`[AI] generating ${count} ${label} variants in parallel…`);
  const t0 = Date.now();

  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) => {
      console.log(`[AI]   ${label} variant ${i + 1}/${count} started`);
      return generateFn(i).then((v) => {
        console.log(`[AI]   ${label} variant ${i + 1}/${count} done`);
        return v;
      });
    })
  );

  const variants: T[] = results
    .filter((r): r is PromiseFulfilledResult<Awaited<T>> => r.status === 'fulfilled')
    .map((r) => r.value as T);

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`[AI] ${failed.length}/${count} ${label} variants failed`);
  }

  if (variants.length === 0) {
    throw new Error(`All ${count} ${label} variants failed`);
  }

  console.log(`[AI] ${variants.length}/${count} ${label} variants done in ${Date.now() - t0}ms, selecting best…`);
  const best = await selectFn(variants);
  console.log(`[AI] best ${label} selected in ${Date.now() - t0}ms total`);
  return best;
}
