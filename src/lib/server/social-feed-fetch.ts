import { env } from '$env/dynamic/private';
import { fetchProfileHistory, type NormalizedPost } from '$lib/server/scrapecreators';

/**
 * IL FEED PUBBLICO DI UN ACCOUNT, PER IL NODO `social_account_feed`.
 *
 * `scrapecreators.ts` è già la fonte per i feed social — sopravvissuta alla demolizione con 16
 * importatori — e `fetchProfileHistory` è già la funzione che prende piattaforma + account e torna
 * i post normalizzati. Questo file non la riscrive: le fa da guardia leggibile, perché
 * `fetchProfileHistory` torna `[]` sia per "zero post" sia per "piattaforma sconosciuta" sia per
 * "l'handle non esiste" — tre fatti diversi che un nodo sulla tela deve poter distinguere, non un
 * riquadro vuoto senza perché.
 *
 * `reddit` e `pinterest` sono due piattaforme che `social_account_feed` ammette
 * (`SOCIAL_PLATFORMS` in `node-data.ts`, lo stesso enum di `social_accounts_platform_check`) ma che
 * `scrapecreators.ts::FETCHERS` non copre ancora: un nodo creato su una di queste due deve dirlo,
 * non restare fermo senza spiegazione.
 */
const SUPPORTED_PLATFORMS = ['instagram', 'tiktok', 'x', 'threads', 'facebook', 'youtube', 'linkedin'] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export function isSupportedFeedPlatform(platform: string): platform is SupportedPlatform {
  return (SUPPORTED_PLATFORMS as readonly string[]).includes(platform);
}

export type FetchFeedResult = { ok: true; posts: NormalizedPost[] } | { ok: false; error: string };

export async function fetchSocialFeed(
  platform: string,
  handle: string,
  limit: number
): Promise<FetchFeedResult> {
  if (!isSupportedFeedPlatform(platform)) {
    return { ok: false, error: `unsupported_platform: ${platform} is not wired to ScrapeCreators yet` };
  }
  if (!handle.trim()) {
    return { ok: false, error: 'missing_handle: this feed has no handle to download' };
  }
  if (!env.SCRAPECREATORS_API_KEY) {
    return { ok: false, error: 'not_configured: ScrapeCreators has no API key on this environment' };
  }

  try {
    const posts = await fetchProfileHistory(
      platform,
      { username: handle, profileUrl: null },
      { maxPosts: Math.max(1, limit) }
    );
    if (!posts.length) {
      return { ok: false, error: `no_posts: no public posts found for @${handle} on ${platform} — check the handle` };
    }
    return { ok: true, posts };
  } catch (e) {
    return { ok: false, error: `fetch_failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
