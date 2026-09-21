import type { PastWinner } from './content-preview/seed-model';

const RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const TOP_WINNERS = 8;
const MIN_RECENT_POOL = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoryRow = { content: string | null; platform: string | null; metrics: any; published_at?: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function engagementScore(metrics: any): number {
  if (!metrics) return 0;
  if (typeof metrics.engagementRate === 'number' && metrics.engagementRate > 0) {
    return metrics.engagementRate;
  }
  return (metrics.likes ?? 0) + (metrics.comments ?? 0) * 2;
}

export function rankRecentWinners(posts: HistoryRow[], now = Date.now()): PastWinner[] {
  const recent = posts.filter(
    (p) => p.published_at && now - Date.parse(p.published_at) <= RECENT_WINDOW_MS
  );
  const pool = recent.length >= MIN_RECENT_POOL ? recent : posts;

  return [...pool]
    .sort((a, b) => engagementScore(b.metrics) - engagementScore(a.metrics))
    .slice(0, TOP_WINNERS)
    .map((p) => ({ content: p.content, platform: p.platform, metrics: p.metrics }));
}
