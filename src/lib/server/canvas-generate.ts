/**
 * FAR GIRARE UN NODO DELLA TELA: il ponte fra quel che il nodo chiede e i motori che il prodotto
 * ha già.
 *
 * QUI NON SI GENERA NIENTE DI NUOVO. `generateBrandImages` e `generateBrandVideo` sono gli stessi
 * che servono `POST /media/images` e `POST /media/videos`: quelle rotte restano l'ingresso della
 * CLI e dell'agente, questo modulo è l'ingresso della tela — che vive su una sessione con cookie e
 * non su un Bearer, quindi non può chiamarle via HTTP senza inventarsi un token. Riscrivere i
 * motori per la tela avrebbe dato due posti in cui un modello si risolve e due in cui una durata
 * si valida; chiamarli è l'unica strada che non li duplica.
 *
 * IL CANCELLO DEI CREDITI NON STA QUI, sta sopra, dove sta anche per le rotte (`gateAiAction`).
 * Metterlo anche qui sarebbe la seconda verità su chi può spendere, e le due divergono alla prima
 * eccezione.
 *
 * UN SOLO RENDER PER GIRO. Le rotte accettano `count`, perché un agente che chiede tre alternative
 * le guarda tutte; un nodo mostra un risultato solo, e chiederne tre pagherebbe tre render per
 * buttarne due. Chi ne vuole tre preme tre volte, e la storia se le tiene tutte.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenMedium, GenParams } from '$lib/canvas/gen-node';
/** Il vecchio deposito (`brand_media`) ammette solo image e video: il testo non ci atterra. */
const LIBRARY_MEDIUMS = ['image', 'video'] as const;

export type RunGenNode = {
  brandId: string;
  userId: string;
  medium: GenMedium;
  prompt: string;
  model: string | null;
  params: GenParams;
};

export type RunGenNodeResult =
  | {
      ok: true;
      /** L'asset, quando c'è già. Un clip torna null: atterra minuti dopo, e la coda lo deposita. */
      mediaId: string | null;
      model: string | null;
      /** Il lavoro in coda, per un clip. Null per un'immagine, che è finita quando questa torna. */
      jobId: string | null;
    }
  | { ok: false; error: string };

const ONE_RENDER = 1;

type AspectRatio = NonNullable<Parameters<typeof import('./media-generate').generateBrandVideo>[0]['aspectRatio']>;

/**
 * Le ragioni per NON partire, in un posto solo e prima di qualunque spesa. Sono le stesse che
 * `blockedReason` mostra nel nodo — quella spegne il bottone, questa chiude la strada a chi il
 * bottone lo aggira: un browser vecchio, una richiesta rifatta a mano, un agente.
 */
function refuse(input: RunGenNode): string | null {
  if (!(LIBRARY_MEDIUMS as readonly string[]).includes(input.medium)) return 'medium_not_runnable';
  if (!input.prompt.trim()) return 'prompt_required';
  if (!input.model) return 'model_required';
  return null;
}

export async function runGenNode(
  supabase: SupabaseClient,
  input: RunGenNode
): Promise<RunGenNodeResult> {
  const refused = refuse(input);
  if (refused) return { ok: false, error: refused };

  const { generateBrandImages, generateBrandVideo } = await import('./media-generate');
  const aspectRatio = input.params.aspectRatio as AspectRatio | undefined;

  if (input.medium === 'video') {
    const out = await generateBrandVideo({
      brandId: input.brandId,
      userId: input.userId,
      kind: 'video',
      prompt: input.prompt,
      model: input.model ?? undefined,
      aspectRatio,
      durationSeconds: input.params.duration
    });

    if (!out.ok) return { ok: false, error: out.error };

    return { ok: true, mediaId: null, model: out.model, jobId: out.jobId };
  }

  const out = await generateBrandImages(supabase, {
    brandId: input.brandId,
    userId: input.userId,
    prompt: input.prompt,
    model: input.model ?? undefined,
    count: ONE_RENDER,
    aspectRatio
  });

  if (!out.ok) return { ok: false, error: out.error };

  // Il render può atterrare e l'archiviazione fallire: `id` null è un disegno che esiste come file
  // e non come riga. Dirlo «fatto» scriverebbe una storia senza asset e un nodo che mostra il
  // vuoto sotto la parola Fatto.
  const mediaId = out.media[0]?.id ?? null;
  if (!mediaId) return { ok: false, error: 'store_failed' };

  return { ok: true, mediaId, model: out.model, jobId: null };
}
