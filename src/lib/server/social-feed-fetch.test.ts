/**
 * `fetchSocialFeed` fa da guardia leggibile davanti a `fetchProfileHistory` (già in produzione,
 * `scrapecreators.ts`): una piattaforma non ancora cablata, un handle vuoto, la chiave mancante e
 * un handle che non esiste sono quattro fatti diversi, e devono tornare quattro errori diversi —
 * non un riquadro vuoto sulla tela senza motivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { envMock, fetchProfileHistory } = vi.hoisted(() => ({
  envMock: {} as Record<string, string | undefined>,
  fetchProfileHistory: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: envMock }));
vi.mock('$lib/server/scrapecreators', () => ({ fetchProfileHistory }));

import { fetchSocialFeed, isSupportedFeedPlatform } from './social-feed-fetch';

beforeEach(() => {
  vi.clearAllMocks();
  envMock.SCRAPECREATORS_API_KEY = 'test-key';
});

describe('isSupportedFeedPlatform', () => {
  it('accetta le piattaforme cablate su scrapecreators.ts', () => {
    expect(isSupportedFeedPlatform('instagram')).toBe(true);
    expect(isSupportedFeedPlatform('tiktok')).toBe(true);
  });

  it('rifiuta reddit e pinterest — admessi dal CHECK ma non ancora cablati', () => {
    expect(isSupportedFeedPlatform('reddit')).toBe(false);
    expect(isSupportedFeedPlatform('pinterest')).toBe(false);
  });
});

describe('fetchSocialFeed', () => {
  it('rifiuta una piattaforma non supportata senza chiamare scrapecreators', async () => {
    const out = await fetchSocialFeed('reddit', 'somesubreddit', 20);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/unsupported_platform/);
    expect(fetchProfileHistory).not.toHaveBeenCalled();
  });

  it('rifiuta un handle vuoto', async () => {
    const out = await fetchSocialFeed('instagram', '   ', 20);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/missing_handle/);
  });

  it('rifiuta quando la chiave ScrapeCreators non è configurata', async () => {
    envMock.SCRAPECREATORS_API_KEY = undefined;
    const out = await fetchSocialFeed('instagram', 'brand', 20);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/not_configured/);
  });

  it('un handle che non esiste (zero post) torna un errore leggibile, non un array vuoto silenzioso', async () => {
    fetchProfileHistory.mockResolvedValue([]);
    const out = await fetchSocialFeed('instagram', 'nonexistent-handle-xyz', 20);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/no_posts/);
  });

  it('torna i post quando ce ne sono', async () => {
    fetchProfileHistory.mockResolvedValue([
      { externalId: '1', url: 'https://instagram.com/p/1', content: 'hi', mediaType: 'image', thumbnailUrl: null, publishedAt: null, metrics: {} }
    ]);
    const out = await fetchSocialFeed('instagram', 'brand', 20);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.posts).toHaveLength(1);
  });

  it('un errore di rete diventa fetch_failed invece di propagarsi non gestito', async () => {
    fetchProfileHistory.mockRejectedValue(new Error('ECONNRESET'));
    const out = await fetchSocialFeed('instagram', 'brand', 20);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/fetch_failed/);
  });
});
