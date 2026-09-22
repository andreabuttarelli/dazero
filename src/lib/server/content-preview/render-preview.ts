import { swallow } from '$lib/server/swallow';
import { PRODUCT_REF_IMAGES, aspectRatioFor, brandOfferings, brandVisualDirective, extractVisualPlaybook, fetchLogoPart, loadMoodRefs, loadProductRefs, personImageMap, personReference, referenceModeFor, renderBrandImage, renderCarouselSlide, resolveOffering, uploadPostImage } from './images';
import { type AnyRec, type BrandProfile, VISUAL_REQUIRED, carouselMaxPerBatch, type ImagePart, type PreviewPost, type Progress } from './seed-model';
import type { SupabaseClient } from '@supabase/supabase-js';
import { synthesizeVisualStyle } from '$lib/server/brand-context';
import { buildMemoryContext } from '$lib/server/brand-memory';
import { withBrandContext } from '$lib/server/ai-log';
import { extractBrandConstraints } from '$lib/server/image-constraint-review';

type RenderPreviewOpts = {
  supabase: SupabaseClient;
  userId: string;
  brandId?: string;
  reviewBrandId?: string;
  // Force one image model for the whole batch, ahead of the brand's own preference. Absent → the
  // brand's Settings choice, and absent that too, buildImageRequest picks as it always has. The
  // guest preview passes the cheapest model here.
  imageModel?: string;
  onProgress?: Progress;
  onPost: (post: PreviewPost) => void;
};

async function brandPreferredImageModel(opts: RenderPreviewOpts): Promise<string | undefined> {
  if (!opts.brandId) return undefined;
  const { data } = await opts.supabase
    .from('brands')
    .select('content_prefs')
    .eq('id', opts.brandId)
    .maybeSingle();
  const { imageModelFor } = await import('$lib/image-models');
  return imageModelFor((data?.content_prefs ?? {}) as { imageModel?: unknown });
}

// Take already-planned posts and render + upload each image in parallel, emitting each post
// (imageUrl set when rendering succeeds) via onPost. Builds the shared render context (offerings,
// people, visual style, brand look, logo) once per batch from the profile. Used by the CLI/API
// `dazero post render` endpoint to render a post's image on demand.
export async function renderPreviewImages(
  profile: BrandProfile,
  posts: PreviewPost[],
  opts: RenderPreviewOpts
): Promise<void> {
  // La preferenza del brand si legge QUI e non nei sette chiamanti: è la produzione della
  // settimana, e sette posti da ricordare sono sette posti da dimenticare. Un `imageModel`
  // esplicito (l'anteprima ospite) vince comunque.
  const brandImageModel = opts.imageModel ?? (await brandPreferredImageModel(opts));
  const reviewBrandId = opts.reviewBrandId ?? opts.brandId;
  const memory = reviewBrandId ? await buildMemoryContext(opts.supabase, reviewBrandId) : profile.ai_context;
  const brandRules = extractBrandConstraints(memory) || undefined;

  function renderForBrand<T>(fn: () => T): T {
    if (reviewBrandId) {
      return withBrandContext(reviewBrandId, fn);
    }
    return fn();
  }

  opts.onProgress?.('generating', `Generating images for ${posts.length} posts…`);

  const offeringList = brandOfferings(profile);
  const personImages = personImageMap(profile);
  const siteType = String(profile?.site_type ?? 'generic');
  let doneCount = 0;

  // Person name → "gender, ageRange" descriptor for the QC gate: an image whose person presents
  // as the wrong gender/age must FAIL QC, not slip through on composition alone.
  const personAttrsMap = new Map<string, string>();
  for (const p of (Array.isArray(profile?.people) ? profile.people : []) as AnyRec[]) {
    const name = String(p?.name ?? '').toLowerCase().trim();
    const a = p?.attributes ?? {};
    const desc = [a?.gender, a?.ageRange].filter(Boolean).join(', ');
    if (name && desc) personAttrsMap.set(name, desc);
  }

  // Visual anchor: prefer the history-derived visual_style; if absent (e.g. a brand-new brand with
  // no scraped posts), synthesise a BASELINE from the brand's own site images + colours so the very
  // first posts are already on-brand instead of free-styled.
  let visualStyle = profile?.visual_style as string | undefined;
  if (!visualStyle && Array.isArray(profile?.images) && profile.images.length) {
    visualStyle =
      (await synthesizeVisualStyle(profile.images, { brandColors: profile?.brand_colors, archetype: profile?.site_type }).catch((error) => { swallow('synthesize visual style', error); return ''; })) || undefined;
  }
  // Concrete palette/typography directive enforced on every render (stops off-brand graphics).
  const brandLook = brandVisualDirective(profile?.brand_colors, (profile?.fonts ?? []).map((f: AnyRec) => f?.name).filter(Boolean));

  // Performance-mined visual directives: synthesizeVisualPlaybook folds a "WHAT WORKS VISUALLY"
  // block into ai_context for the copywriter — surface that SAME block to the image renderer,
  // which otherwise never sees it (the strongest visual signal we have was text-only).
  const visualPlaybook = extractVisualPlaybook(profile?.ai_context);

  // The brand's real logo (rasterised if SVG), fed as a reference on branded/graphic posts so the
  // model reproduces the ACTUAL logo instead of inventing a wordmark. Loaded once for the batch.
  // Skip 'og-image' logos — those are site screenshots/banners, not the brand mark.
  const logoUrl = (Array.isArray(profile?.logos) ? profile.logos : [])
    .find((l: AnyRec) => l?.url && l?.type !== 'og-image')?.url as string | undefined;
  const logoPart = logoUrl ? await fetchLogoPart(logoUrl) : null;

  // The brand's own reference shots (Studio → Knowledge → Images), attached to every render as
  // pure STYLE/MOOD anchors so generated photos share the brand's aesthetic. Loaded once per batch.
  const moodImages = await loadMoodRefs(profile?.moodImages as string[] | undefined);

  // Generate every image in parallel; emit each post the moment it's ready.
  // Text-only posts (X/Threads) skip image generation entirely — no render, no cost.
  // Platforms that require a visual are force-flipped to image even if the planner marked them text.
  await Promise.all(
    posts.map(async (post) => {
      if (post.imageUrl || (post.imageUrls && post.imageUrls.length > 0)) {
        opts.onPost(post);
        return;
      }
      const plat = String(post.platform ?? '').toLowerCase();
      if (VISUAL_REQUIRED.has(plat) && post.media !== 'image' && post.media !== 'video') {
        post.media = 'image';
        if (post.format === 'text_post' || post.format === 'link_post') post.format = 'single_image';
      }
      // Safety net: an image post without a prompt still needs a scene to render.
      if (post.media !== 'text' && post.media !== 'link' && !String(post.image_prompt ?? '').trim()) {
        const productBit = post.product ? `featuring ${post.product}` : 'on-brand';
        post.image_prompt = `Photorealistic, scroll-stopping social photo ${productBit} for ${profile?.name || 'the brand'}. ${post.caption ? `Mood matching: ${String(post.caption).slice(0, 120)}` : ''}`.trim();
      }
      if (post.media !== 'text' && post.media !== 'link' && post.image_prompt) {
        try {
          // Pixel-perfect reuse of a Media library asset — skip Nano Banana entirely.
          if (post.mediaId && post.mediaMode !== 'composite' && opts.brandId) {
            const { publishLibraryImageAsPostMedia } = await import('$lib/server/brand-media');
            const published = await publishLibraryImageAsPostMedia(opts.supabase, {
              brandId: opts.brandId,
              userId: opts.userId,
              mediaId: post.mediaId,
              platform: post.platform
            });
            if ('publicUrl' in published) {
              post.imageUrl = published.publicUrl;
              (post as AnyRec).__fromLibrary = post.mediaId;
              opts.onPost(post);
              return;
            }
            // Fall through to generation if publish failed.
            console.warn('[renderPreviewImages] library publish failed:', 'error' in published ? published.error : '');
          }

          const featured = resolveOffering(post.product, offeringList);
          const [productRefs, personRefs, libraryRefs] = await Promise.all([
            loadProductRefs(featured?.images),
            personReference(post, personImages),
            post.mediaId && post.mediaMode === 'composite' && opts.brandId
              ? (await import('$lib/server/brand-media')).loadLibraryMediaParts(opts.supabase, opts.brandId, [post.mediaId])
              : Promise.resolve([] as ImagePart[])
          ]);
          const referenceImages = [...(libraryRefs ?? []), ...(productRefs ?? [])].slice(0, PRODUCT_REF_IMAGES);
          const kind = featured?.kind ?? '';
          const referenceMode = libraryRefs?.length ? 'product' as const : referenceModeFor(kind, siteType);
          // Onboarding / first-week preview: never leave a visual-required platform imageless just
          // because the product catalog photo is missing — drop the product anchor and render a
          // branded scene instead. A blank card is worse than a generated lifestyle shot.
          if (post.product && referenceMode === 'product' && !referenceImages?.length) {
            if (VISUAL_REQUIRED.has(plat)) {
              post.product = '';
            } else {
              opts.onPost(post);
              return;
            }
          }
          // Feed the logo only on branded/graphic posts — those with no product or person photo,
          // exactly where the model would otherwise invent a wordmark. Keep it off product/person
          // shots so it isn't awkwardly slapped onto a candid photo.
          const logoImage = !referenceImages?.length && !personRefs?.length ? (logoPart ?? undefined) : undefined;
          // Video posts render their cover 9:16 — the clip inherits the cover's dimensions.
          const aspectRatio = aspectRatioFor(post.platform, post.format);
          const renderOpts = {
            referenceImages,
            personImages: personRefs,
            ...(brandImageModel ? { model: brandImageModel } : {}),
            moodImages,
            visualStyle,
            visualPlaybook,
            referenceMode,
            brandLook,
            brandRules,
            logoImage,
            aspectRatio
          };

          // Carousel gate at RENDER time: needs the slide prompts AND a live carousel budget.
          // CAROUSEL_MAX_PER_BATCH=0 is the kill switch — even a pre-existing carousel draft
          // renders (and ships) as a plain single image.
          const isCarousel = post.format === 'carousel' && (post.image_prompts?.length ?? 0) >= 2 && carouselMaxPerBatch() > 0;
          if (post.format === 'carousel' && !isCarousel) {
            post.format = 'single_image';
            post.image_prompts = undefined;
          }

          // Render + QC gate. High stakes (a real person or a real product photo in frame) → two
          // candidates in parallel and the critic picks the better one; else single render. The best
          // image then gets cumulative-hint corrective retries if it still fails QC. For a carousel
          // this renders SLIDE 1 (the cover — image_prompt === image_prompts[0]) at full quality.
          const highStakes = !!personRefs?.length || !!referenceImages?.length;

          const dataUrl = await renderForBrand(() => renderBrandImage(post.image_prompt, renderOpts));
          const qc = undefined;
          // Expose the verdict so callers can surface it (CLI --verbose).
          if (qc) (post as AnyRec).__qc = qc;

          if (dataUrl) {
            const cover = await uploadPostImage(opts.supabase, opts.userId, dataUrl, aspectRatio);
            post.imageUrl = cover;
            if (isCarousel && cover) {
              // Slides 2..N in parallel, each anchored to the QC'd slide 1 (attached as a style
              // reference) with light QC — see renderCarouselSlide. Failed slides are dropped; a
              // series that ends up with < 2 slides ships as a plain single image.
              const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              const anchor: ImagePart | undefined = m ? { inlineData: { mimeType: m[1], data: m[2] } } : undefined;
              const total = post.image_prompts!.length;
              const rest = await Promise.all(
                post.image_prompts!.slice(1).map((slidePrompt, idx) =>
                  renderForBrand(() =>
                    renderCarouselSlide(opts.supabase, opts.userId, slidePrompt, idx + 1, total, renderOpts, anchor, {
                      productName: post.product,
                      productKind: featured?.kind,
                      referenceImages,
                      visualStyle
                    })
                  )
                )
              );
              const urls = [cover, ...rest.filter((u): u is string => !!u)];
              if (urls.length > 1) {
                post.imageUrls = urls;
              } else {
                post.format = 'single_image';
                post.image_prompts = undefined;
              }
            }
          }
        } catch (e) {
          // leave imageless — the caption still previews
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[renderPreviewImages] render failed for "${post.product}": ${msg}`);
          (post as AnyRec).__renderError = msg;
        }
      }
      opts.onPost(post);
      doneCount++;
      opts.onProgress?.(
        'generating',
        `Image ${Math.min(doneCount, posts.length)} of ${posts.length} ready…`
      );
    })
  );
}
