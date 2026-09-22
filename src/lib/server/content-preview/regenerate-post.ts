import { type AnyRec, type ImagePart, guidanceFor } from './seed-model';
import { PRODUCT_REF_IMAGES, aspectRatioFor, brandVisualDirective, loadBrandLogoImagePart, loadMoodRefs, renderBrandImage, uploadPostImage } from './images';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchImagePart } from '$lib/server/brand-context';
import { structured } from '$lib/server/research';

const REGEN_SCHEMA = {
  type: 'object' as const,
  properties: {
    caption: { type: 'string' as const, description: 'Revised on-brand caption with 2-3 hashtags' },
    image_prompt: { type: 'string' as const, description: 'Revised image description; empty string for text-only posts' }
  },
  required: ['caption', 'image_prompt']
};

// Rigenera un post dal feedback: caption (+ image_prompt) e poi l'immagine, se non è text-only.
// Best-effort sull'immagine: al fallimento `imageUrl` resta undefined e il chiamante tiene la vecchia.
export async function regeneratePost(opts: {
  supabase: SupabaseClient;
  userId: string;
  platform: string | null;
  caption: string | null;
  imagePrompt: string | null;
  feedback: string;
  textOnly: boolean;

  visualStyle?: string | null;
  // Nome + categoria del prodotto, così il QC può giudicare fedeltà e scala.
  productName?: string;
  productKind?: string;
  productImageUrls?: string[];
  // Gli scatti di riferimento del brand come ancore di stile, come nel batch.
  moodImageUrls?: string[];
  // Aperti: è il testo del feedback a decidere cosa prenderne. Ignorati sui post text-only.
  userReferenceImageUrls?: string[];
  // Palette + font, stessa direttiva del render di batch.
  brandColors?: string[] | null;
  brandFonts?: string[] | null;
  // Caption language (English name, e.g. "Italian"); empty = keep the current caption's language.
  language?: string | null;
  // Optional brand-authored per-platform instructions (content_prefs.platformInstructions), so a
  // regenerated caption respects the same length/voice rules as a freshly generated one.
  platformInstructions?: Record<string, string> | null;
  // Brand-approved hashtag set per platform (content_prefs.platformHashtags) — same constraint the
  // batch planner applies: only these hashtags, never invented ones.
  platformHashtags?: Record<string, string[]> | null;
  // The post's CURRENT image URL. When present, it's fed to the renderer as the BASE to edit, so the
  // feedback refines the existing image in place rather than producing an unrelated new one.
  baseImageUrl?: string | null;
  brandId?: string;
}): Promise<{ caption: string; imagePrompt: string; imageUrl?: string; notes?: string; costUsd?: number; credits?: number }> {
  const langLine = opts.language?.trim()
    ? `Write the caption in ${opts.language.trim()}.`
    : 'Keep the caption in the same language as the current caption.';
  // Per-platform length/register guidance (default + any brand override) so a regenerated LinkedIn
  // post stays long-form, an X post stays tight, etc.
  const guide = guidanceFor(opts.platform ?? '', { platformInstructions: opts.platformInstructions ?? undefined, platformHashtags: opts.platformHashtags ?? undefined });
  const guideLine = guide ? `\nPLATFORM GUIDANCE (write the caption to fit this): ${guide}` : '';
  // When we have the current image to edit, the image_prompt must describe the SAME image with the
  // feedback applied (not an unrelated new scene) — the renderer is handed the current image as the
  // base. Without a base image, ask for a full fresh description as before.
  const imagePromptInstruction = opts.textOnly
    ? ' and an empty "image_prompt"'
    : opts.baseImageUrl
      ? ' and a revised "image_prompt" that describes the CURRENT image with the user\'s feedback applied: keep the same subject, composition and style, and change ONLY what the feedback asks for (don\'t specify an aspect ratio — the renderer sizes it to the platform)'
      : ' and a revised "image_prompt" describing a photorealistic, scroll-stopping image (don\'t specify an aspect ratio — the renderer sizes it to the platform)';
  const prompt = `Revise this single social media post based on the user's feedback. Keep it on-brand and native to the platform.
Platform: ${opts.platform ?? ''}
Current caption: ${opts.caption ?? ''}
Current image description: ${opts.imagePrompt ?? '(none)'}
User feedback: ${opts.feedback}
${langLine}${guideLine}
Return JSON with the improved "caption"${imagePromptInstruction}.`;

  const parsed: AnyRec = await structured(prompt, REGEN_SCHEMA,
    'You are an expert performance-marketing content planner. Apply the feedback precisely; keep it on-brand.',
    { label: 'regeneratePost', brandId: opts.brandId, userId: opts.userId, context: 'regenerate_post' });
  const caption = (parsed.caption as string) || opts.caption || '';
  let imagePrompt = opts.textOnly ? '' : ((parsed.image_prompt as string) || opts.imagePrompt || '');

  let imageUrl: string | undefined;
  let notes: string | undefined;
  let costUsd: number | undefined;
  let credits: number | undefined;
  if (!opts.textOnly && imagePrompt) {
    // Always attach the official brand-kit logo when present — same as generateStandaloneImage /
    // design_graphic. The render prompt already says candid photos may omit on-image branding.
    let logoImage: ImagePart | undefined;
    if (opts.brandId) {
      const { data: logoKit } = await opts.supabase
        .from('brand_kit')
        .select('logos')
        .eq('brand_id', opts.brandId)
        .maybeSingle();
      logoImage = (await loadBrandLogoImagePart(logoKit?.logos)) ?? undefined;
    }

    // Fetch product refs, the current image (the edit base) and the brand mood refs together;
    // all are best-effort.
    const [refs, baseImage, moodImages, userRefs] = await Promise.all([
      Promise.all((opts.productImageUrls ?? []).slice(0, PRODUCT_REF_IMAGES).map(fetchImagePart)).then(
        (parts) => parts.filter(Boolean) as ImagePart[]
      ),
      opts.baseImageUrl ? fetchImagePart(opts.baseImageUrl) : Promise.resolve(null),
      loadMoodRefs(opts.moodImageUrls),
      Promise.all((opts.userReferenceImageUrls ?? []).slice(0, 4).map(fetchImagePart)).then(
        (parts) => parts.filter(Boolean) as ImagePart[]
      )
    ]);
    const renderOpts = {
      referenceImages: refs.length ? refs : undefined,
      baseImage: baseImage ?? undefined,
      moodImages,
      userRefImages: userRefs.length ? userRefs : undefined,
      logoImage,
      visualStyle: opts.visualStyle ?? undefined,
      brandLook: brandVisualDirective(opts.brandColors, opts.brandFonts) || undefined,
      aspectRatio: aspectRatioFor(opts.platform)
    };
    // Un render, come ovunque: niente critico e niente anello che ridisegna.
    const dataUrl = await renderBrandImage(imagePrompt, renderOpts);
    if (dataUrl) imageUrl = await uploadPostImage(opts.supabase, opts.userId, dataUrl, aspectRatioFor(opts.platform));
  }
  return { caption, imagePrompt, imageUrl, notes, costUsd, credits };
}
