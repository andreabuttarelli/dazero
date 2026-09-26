/**
 * Resolve social-handle images into signed https URLs the graphic composer and image generator
 * can consume as AVAILABLE IMAGES / references.
 */
import { createAdminClient } from '$lib/server/supabase-admin';
import { fetchSocialProfile } from '$lib/server/scrapecreators';
import { archiveImageToBucket, signKnowledgePaths } from '$lib/server/media-archive';

export type VisualRef = { url: string; label?: string | null };

const SOCIAL_THUMB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SOCIAL_THUMB_SIGN_TTL_S = 7 * 24 * 60 * 60;
const MAX_SOCIAL_THUMBS = 8;

/**
 * ScrapeCreators → archive thumbs into our bucket → signed URLs.
 * Same path as Designer › social-thumbs (avoids Instagram CORP blocking).
 */
export async function fetchSocialVisualRefs(
  platform: string,
  handle: string
): Promise<{ thumbs: VisualRef[]; error?: string }> {
  const plat = platform.trim().toLowerCase();
  const h = handle.trim().replace(/^@/, '').toLowerCase();
  if (!plat || !h) return { thumbs: [], error: 'missing platform or handle' };

  const admin = createAdminClient();
  let paths: string[] = [];
  const { data: cached } = await admin
    .from('social_thumb_cache')
    .select('paths, fetched_at')
    .eq('platform', plat)
    .eq('handle', h)
    .maybeSingle();

  const fresh = cached && Date.now() - new Date(cached.fetched_at as string).getTime() < SOCIAL_THUMB_CACHE_TTL_MS;
  if (fresh && Array.isArray(cached!.paths) && cached!.paths.length) {
    paths = cached!.paths as string[];
  } else {
    try {
      const profile = await fetchSocialProfile(plat, h);
      const urls = (profile.thumbs ?? []).slice(0, MAX_SOCIAL_THUMBS);
      const safeHandle = h.replace(/[^a-z0-9_.-]/g, '_');
      const archived = await Promise.all(
        urls.map((u, i) => archiveImageToBucket(admin, `thumb-cache/${plat}/${safeHandle}/${i}.jpg`, u))
      );
      paths = archived.filter((p): p is string => !!p);
      await admin.from('social_thumb_cache').upsert({
        platform: plat,
        handle: h,
        paths,
        fetched_at: new Date().toISOString()
      });
    } catch (e) {
      return { thumbs: [], error: e instanceof Error ? e.message : 'scrape_failed' };
    }
  }

  if (!paths.length) return { thumbs: [] };
  const signed = await signKnowledgePaths(admin, paths, SOCIAL_THUMB_SIGN_TTL_S);
  const thumbs = paths
    .map((p) => signed.get(p))
    .filter((u): u is string => !!u)
    .map((url) => ({ url, label: `social:${plat}/@${h}` }));
  return { thumbs };
}
