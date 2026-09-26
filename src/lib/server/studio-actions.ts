import { fail } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import { invalidateBrandNav } from '$lib/server/nav-cache';
import { withBrandContext } from '$lib/server/ai-log';
import { brandSlugOf } from '$lib/server/tenancy/brand-slug';
import { safeFetchBytes, SafeFetchError, type SafeFetchReason } from '$lib/server/tool-guard';

// Ceiling on the brand's free-text video direction. The video prompt is a stack of structural
// clauses (clean-frame rule, motion brief, spoken line, fidelity) and the model weights what it
// reads: an unbounded paste would drown them and the clip stops obeying the parts that matter.
export const VIDEO_INSTRUCTIONS_MAX = 600;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function brandOfProject(supabase: any, projectId: string) {
  const slug = await brandSlugOf(supabase, projectId);
  if (!slug) return null;
  const { data } = await supabase
    .from('brands')
    .select('id, slug, content_prefs')
    .eq('slug', slug)
    .maybeSingle();
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withBrand<T>(supabase: any, projectId: string | undefined, fn: (brand: any) => Promise<T>): Promise<T> {
  if (!projectId) return fail(404, { error: 'Brand not found' }) as T;
  const brand = await brandOfProject(supabase, projectId);
  if (!brand) return fail(404, { error: 'Brand not found' }) as T;
  return withBrandContext(brand.id, async () => {
    try {
      return await fn(brand);
    } finally {
      invalidateBrandNav(brand.slug);
    }
  });
}

/**
 * Il logo quando ad aggiornarlo è la CHAT, non il form. Sta in questo file di proposito: bucket,
 * nome del file e forma della riga in `brand_kit.logos` devono restare UNA cosa sola, o le due
 * strade divergono al primo cambio e nessuno se ne accorge finché un render non esce senza logo.
 *
 * Un tool che salvasse l'URL remoto così com'è scriverebbe in `logos` un link che scade (una CDN
 * social, un signed URL, un allegato di chat): il renderer se lo va a prendere ogni volta, quindi
 * il giorno che muore le immagini escono senza logo — e non fallisce niente, quindi non lo segnala
 * nessuno. Per questo l'immagine viene COPIATA nel bucket pubblico, esattamente come fa l'upload.
 *
 * L'unica differenza col form è inevitabile: lì l'ingresso è un File e passa da `readUploadImage`
 * (che converte anche gli HEIC), qui è un URL, quindi c'è un fetch con guardia SSRF. Il tetto di
 * byte, il path e la riga sono gli stessi.
 *
 * L'URL lo sceglie un MODELLO (`set_brand_logo`), quindi è testo che un contenuto ostile può
 * dettare: la guardia deve risolvere l'indirizzo, non leggere l'hostname, e deve ricontrollarlo
 * su ogni redirect. `safeFetchBytes` fa entrambe le cose ed è l'unica copia di quel controllo.
 */
const LOGO_MAX_BYTES = 4_000_000;
const LOGO_TIMEOUT_MS = 15_000;

// http resta ammesso: il logo di onboarding arriva dal sito del brand, e un sito ancora in chiaro
// è comune abbastanza che rifiutarlo romperebbe l'onboarding per chiudere un buco che si chiude
// comunque risolvendo l'indirizzo.
const LOGO_ERROR_BY_REASON: Record<SafeFetchReason, string> = {
  not_public: 'That image URL is not fetchable (blocked or not http/https).',
  too_large: 'Too large — the logo must be under 4MB.',
  fetch_failed: 'Could not download the image.'
};

export async function storeBrandLogoFromUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { userId: string; imageUrl: string }
): Promise<{ url: string } | { error: string }> {
  const src = String(opts.imageUrl ?? '').trim();
  if (!src) return { error: 'No image URL' };

  let fetched;
  try {
    fetched = await safeFetchBytes(src, { maxBytes: LOGO_MAX_BYTES, timeoutMs: LOGO_TIMEOUT_MS });
  } catch (e) {
    if (e instanceof SafeFetchError) return { error: LOGO_ERROR_BY_REASON[e.reason] };
    return { error: 'Could not download the image.' };
  }

  if (!fetched.ok) return { error: `Could not download the image (HTTP ${fetched.status}).` };
  if (!fetched.mime.startsWith('image/')) return { error: 'That URL is not an image.' };
  if (!fetched.bytes.length) return { error: 'The image is empty.' };

  const { mime, bytes } = fetched;

  // Stessa mappa del form: tutto ciò che non è png/gif/webp finisce come jpg.
  const ext = mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `${opts.userId}/studio/logo-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from('media').upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) return { error: String(up.error.message ?? 'Upload failed') };
  const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  if (!url) return { error: 'Upload succeeded but produced no public URL.' };
  return { url };
}

export const studioActions: Actions = {

  // Clip length for generated videos (Settings → Video). Stored on content_prefs.videoDuration so
  // it needs no migration and travels with the other generation preferences. Clamped against the
  // brand's chosen (or env-default) model — the ceiling is that model's maxDuration, never a
  // global constant.
  updateVideoDuration: async ({ request, params, locals: { supabase } }) => {
    return withBrand(supabase, params.projectId, async (brand) => {
      const fd = await request.formData();
      const { clampVideoDuration, isKnownVideoModel } = await import('$lib/server/video');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prefs: Record<string, any> = { ...(brand.content_prefs ?? {}) };
      const raw = String(fd.get('videoDuration') ?? '').trim();
      const model = isKnownVideoModel(prefs.videoModel) ? prefs.videoModel : null;
      // Empty = "use the default" — delete rather than store a zero, so the default can move later
      // without every brand being pinned to today's number.
      if (!raw) delete prefs.videoDuration;
      else prefs.videoDuration = clampVideoDuration(raw, model);
      const { error } = await supabase.from('brands').update({ content_prefs: prefs }).eq('id', brand.id);
      if (error) return fail(400, { error: error.message });
      return { saved: true };
    });
  },

  // Quale modello serve quale mestiere (Settings -> Images & video). Una sola azione per tutti e
  // sei gli slot: la regola che un modello deve saper fare il lavoro in cui viene salvato vale
  // ovunque, e scritta sei volte divergerebbe al primo cambio.
  updateMediaModel: async ({ request, params, locals: { supabase } }) => {
    return withBrand(supabase, params.projectId, async (brand) => {
      const fd = await request.formData();
      const { mediaModelSlot } = await import('$lib/media-model-slots');
      const slot = mediaModelSlot(fd.get('slot'));
      if (!slot) return fail(400, { error: 'Unknown model slot' });

      // La regola sta in `chooseMediaModel`, non qui: il browser e i tool dell'API la chiamano
      // entrambi, e scritta due volte divergerebbe al primo modello nuovo.
      const { chooseMediaModel } = await import('$lib/server/media-model-prefs');
      const { prefs } = chooseMediaModel(
        brand.content_prefs as Record<string, unknown> | null,
        slot,
        String(fd.get('model') ?? '').trim() || null
      );
      if (!prefs) return fail(400, { error: 'Unknown model for this slot' });

      const { error } = await supabase.from('brands').update({ content_prefs: prefs }).eq('id', brand.id);
      if (error) return fail(400, { error: error.message });
      return { saved: true };
    });
  },

  // Shipping resolution for generated videos (Settings → Video). 720p costs exactly DOUBLE per
  // second, and every draft is paid for whether or not it ever ships — which is why 480p is the
  // recommended default and this is an explicit opt-in rather than a quality ladder we climb for
  // the brand. Same storage shape as videoDuration: on content_prefs, no migration.
  updateVideoResolution: async ({ request, params, locals: { supabase } }) => {
    return withBrand(supabase, params.projectId, async (brand) => {
      const fd = await request.formData();
      const { clampVideoResolution } = await import('$lib/server/video');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prefs: Record<string, any> = { ...(brand.content_prefs ?? {}) };
      const raw = String(fd.get('videoResolution') ?? '').trim();
      // Empty = "use the default" — deleted rather than pinned, so the default can move later.
      if (!raw) delete prefs.videoResolution;
      else prefs.videoResolution = clampVideoResolution(raw);
      const { error } = await supabase.from('brands').update({ content_prefs: prefs }).eq('id', brand.id);
      if (error) return fail(400, { error: error.message });
      return { saved: true };
    });
  },

  // Free-text video direction (Settings → Video). Steers the CLIP — spoken delivery, energy,
  // what the person on camera must never do — as opposed to platformInstructions, which steers the
  // caption. Capped so a pasted essay can't crowd out the structural parts of the video prompt;
  // blank clears the override rather than storing an empty string.
  updateVideoInstructions: async ({ request, params, locals: { supabase } }) => {
    return withBrand(supabase, params.projectId, async (brand) => {
      const fd = await request.formData();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prefs: Record<string, any> = { ...(brand.content_prefs ?? {}) };
      const text = String(fd.get('videoInstructions') ?? '').trim().slice(0, VIDEO_INSTRUCTIONS_MAX);
      if (text) prefs.videoInstructions = text;
      else delete prefs.videoInstructions;
      const { error } = await supabase.from('brands').update({ content_prefs: prefs }).eq('id', brand.id);
      if (error) return fail(400, { error: error.message });
      return { saved: true };
    });
  }
};
