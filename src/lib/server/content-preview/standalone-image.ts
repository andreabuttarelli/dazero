import { swallow } from '$lib/server/swallow';
import { type AspectRatio, type QcVerdict, aspectRatioFor, brandVisualDirective, extractVisualPlaybook, loadBrandLogoImagePart, loadBrandMoodImageUrls, loadMoodRefs, renderBrandImage, uploadPostImage } from './images';
import { imageModelFor, imageRefineModelFor } from '$lib/image-models';
import { type AnyRec, type ContentPrefs, type ImagePart } from './seed-model';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchImagePart } from '$lib/server/brand-context';

// Generate a single image from a prompt, using the brand's visual context (palette, fonts, mood
// images, visual style). No post is created — returns the uploaded image URL only. Used by chat
// media generation and YouTube thumbnails.
export async function generateStandaloneImage(opts: {
  supabase: SupabaseClient;
  userId: string;
  brandId: string;
  prompt: string;
  platform?: string;
  aspectRatio?: AspectRatio;
  mediaIds?: string[];
  /** Arbitrary images to hand the renderer as visual references (chat picks, user attachments). */
  referenceUrls?: string[];
}): Promise<{ imageUrl?: string; qc?: QcVerdict; notes?: string; costUsd?: number; credits?: number }> {

  const doneStandalone = async (
    result: { imageUrl?: string; qc?: QcVerdict; notes?: string; costUsd?: number; credits?: number }
  ) => {
    if (result.imageUrl && opts.mediaIds?.length) {
      const { recordBrandMediaUse } = await import('$lib/server/brand-media');
      await recordBrandMediaUse(opts.supabase, opts.brandId, opts.mediaIds);
    }
    return result;
  };

  const [{ data: kit }, { data: brandRow }] = await Promise.all([
    opts.supabase.from('brand_kit')
      .select('visual_style, ai_context, brand_colors, fonts, logos')
      .eq('brand_id', opts.brandId)
      .maybeSingle(),
    opts.supabase.from('brands').select('content_prefs').eq('id', opts.brandId).maybeSingle()
  ]);

  const brandLook = brandVisualDirective(
    kit?.brand_colors as string[] | null,
    (Array.isArray(kit?.fonts) ? (kit!.fonts as AnyRec[]) : []).map((f) => f?.name).filter(Boolean) as string[]
  );
  const aspectRatio = opts.aspectRatio ?? aspectRatioFor(opts.platform);
  // Chat generate_image / design_graphic(generate_prompt): always hand the official mark to the
  // renderer — no need for the model to pass media_ids for the brand logo.
  const logoImage = (await loadBrandLogoImagePart(kit?.logos)) ?? undefined;

  // Resolve every user/library photo once. First frame = BASE to edit (add logo / light change);
  // the rest stay as fidelity refs. Same contract as media-generator generate_image.
  const libraryUrls = opts.mediaIds?.length
    ? await (await import('$lib/server/brand-media')).resolveBrandImageIds(
        opts.supabase,
        opts.brandId,
        opts.mediaIds
      )
    : [];
  const allRefUrls = [
    ...libraryUrls.filter(Boolean),
    ...(opts.referenceUrls ?? []).filter((u) => typeof u === 'string' && !!u)
  ].slice(0, 4);
  const baseUrl = allRefUrls[0];
  const extraUrls = allRefUrls.slice(1);
  const editBrief = baseUrl
    ? `${opts.prompt}\n\nEdit the attached BASE photo in place — keep the scene, subject and composition; apply only what this prompt asks (e.g. place the official brand logo). Do not replace the photo with a blank canvas.`
    : opts.prompt;

  const moodUrls = await loadBrandMoodImageUrls(opts.supabase, opts.brandId).catch((error) => { swallow('load mood image urls', error); return []; });
  const [moodImages, baseImage, extraParts] = await Promise.all([
    loadMoodRefs(moodUrls),
    baseUrl ? fetchImagePart(baseUrl) : Promise.resolve(null),
    Promise.all(extraUrls.map((u) => fetchImagePart(u))).then(
      (parts) => parts.filter(Boolean) as ImagePart[]
    )
  ]);

  if (allRefUrls.length && !baseImage && !extraParts.length) {
    console.warn(
      '[generateStandaloneImage] reference URL(s) provided but fetchImagePart returned nothing'
    );
  }

  const renderOpts = {
    model: imageModelFor((brandRow?.content_prefs ?? {}) as ContentPrefs),
    refineModel: imageRefineModelFor((brandRow?.content_prefs ?? {}) as ContentPrefs),
    baseImage: baseImage ?? undefined,
    referenceImages: extraParts.length ? extraParts : undefined,
    referenceMode: extraParts.length ? ('product' as const) : undefined,
    moodImages,
    logoImage,
    visualStyle: (kit?.visual_style as string | undefined) || undefined,
    visualPlaybook: extractVisualPlaybook(kit?.ai_context) || undefined,
    brandLook: brandLook || undefined,
    aspectRatio
  };

  const dataUrl = await renderBrandImage(editBrief, renderOpts);
  const qc = undefined;

  let imageUrl: string | undefined;
  if (dataUrl) imageUrl = await uploadPostImage(opts.supabase, opts.userId, dataUrl, aspectRatio);
  return doneStandalone({ imageUrl, qc });
}
