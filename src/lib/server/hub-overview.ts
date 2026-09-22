import type { SupabaseClient } from '@supabase/supabase-js';
import { currentPhaseIndex, gtmRowToPlan } from '$lib/server/gtm';
import { currentWeekIndex } from '$lib/server/editorial-plan';
import { hasWebHub, isPaidPlan, hasBacklinkNetwork } from '$lib/server/plans';
import { studioCompleteness } from '$lib/studio-completeness';
import { aggregateRecentEngagement, type SocialHistoryRow } from '$lib/server/social-history-metrics';

type BrandRow = { id: string; slug: string; plan: string | null; timezone: string; content_prefs?: unknown };

export type PendingPostPreview = {
  id: string;
  platform: string | null;
  caption: string | null;
  media_url: string | null;
  format: string | null;
};

export type PendingBlogPreview = {
  id: string;
  title: string | null;
  status: string;
  cover_url: string | null;
};

/** Un post gia' uscito, con la sua foto: e' cio' che la home mostra per dire che il lavoro esiste. */
export type PublishedPostPreview = {
  id: string;
  platform: string | null;
  caption: string | null;
  media_url: string | null;
  published_at: string | null;
};

export type ScheduledPostPreview = {
  id: string;
  platform: string | null;
  caption: string | null;
  media_url: string | null;
  scheduled_for: string;
};

export type ScheduledBlogPreview = {
  id: string;
  title: string | null;
  cover_url: string | null;
  scheduled_for: string;
};

export type StrategyOverview = {
  gtm: {
    ready: boolean;
    phaseName: string | null;
    proposedCount: number;
  };
  plan: {
    ready: boolean;
    weekLabel: string | null;
    proposedCount: number;
  };
};

export type PublishOverview = {
  queue: { pending: number; scheduled: number; failed: number; posts: PendingPostPreview[] };
  calendar: { upcoming: number };
  campaigns: { count: number };
  analytics: { published: number; trackedPosts: number };
  competitors: { count: number; posts: number };
  web: { blogPending: number };
  paid: boolean;
};

export type WebOverview = {
  paid: boolean;
  /** dazero cross-brand backlink network (the article link graph). */
  network: {
    enabled: boolean;
    outgoing: number;
    incoming: number;
    openOpportunities: number;
  };
  library: {
    pages: number;
  };
  blog: {
    enabled: boolean;
    articles: number;
    published: number;
    pending: number;
    domains: number;
  };
};

export type HomeOverview = {
  paid: boolean;
  setup: {
    studioPct: number;
    hasStrategy: boolean;
    hasEditorialPlan: boolean;
    blogEnabled: boolean;
    socialAccounts: number;
  };
  queue: {
    pending: number;
    scheduled: number;
    posts: PendingPostPreview[];
    upcoming: ScheduledPostPreview[];
    /** Gli ultimi usciti davvero. La home apre su questi: e' l'unica prova che il prodotto lavora. */
    published: PublishedPostPreview[];
  };
  blog: {
    pending: number;
    published: number;
    scheduled: number;
    articles: PendingBlogPreview[];
    upcoming: ScheduledBlogPreview[];
  };
  analysis: {
    published: number;
    trackedPosts: number;
    /**
     * Lifetime metrics on posts published in the analysis window (30d, or latest tracked
     * posts when the brand has not published recently). Field names kept for UI compat.
     */
    views7d: number;
    likes7d: number;
    /** Last 7 calendar days by published_at, oldest → newest. */
    viewsByDay: number[];
    likesByDay: number[];
    /** ISO timestamp of the newest social_post_history.synced_at, if any. */
    statsUpdatedAt: string | null;
  };
};

export type BrandOverview = {
  identity: {
    completionPct: number;
    hasLogo: boolean;
    colors: number;
    products: number;
    competitors: number;
  };
  knowledge: {
    documents: number;
    pending: number;
    failed: number;
    chunks: number;
    memories: number;
    pinned: number;
    lastIngestAt: string | null;
  };
  media: { assets: number; ready: number };
  voice: { examples: number; hasVisualStyle: boolean };
  rubrics: { count: number };
  /** Banco idee dirompenti: quante sono ancora da girare. */
  ideas: { live: number };
};

export async function loadStrategyOverview(
  supabase: SupabaseClient,
  brand: BrandRow
): Promise<StrategyOverview> {
  const [{ data: gtmRow }, { count: proposedGtm }, { data: editRow }, { count: proposedEdit }] =
    await Promise.all([
      supabase
        .from('gtm_plans')
        .select('phases, horizon, objective')
        .eq('brand_id', brand.id)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('gtm_plans')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('status', 'proposed'),
      supabase
        .from('editorial_plans')
        .select('weeks')
        .eq('brand_id', brand.id)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('editorial_plans')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('status', 'proposed')
    ]);

  let phaseName: string | null = null;
  if (gtmRow) {
    const plan = gtmRowToPlan(gtmRow);
    const idx = currentPhaseIndex(plan, brand.timezone);
    if (idx != null && plan.phases[idx]) phaseName = plan.phases[idx].name;
  }

  const weeks = Array.isArray(editRow?.weeks) ? (editRow.weeks as { theme?: string }[]) : [];
  const weekIdx = weeks.length ? currentWeekIndex({ weeks }, brand.timezone) : null;
  const weekLabel =
    weekIdx != null && weeks[weekIdx]
      ? weeks[weekIdx].theme?.trim() || `Week ${weekIdx + 1}`
      : null;

  return {
    gtm: {
      ready: !!gtmRow,
      phaseName,
      proposedCount: proposedGtm ?? 0
    },
    plan: {
      ready: weeks.length > 0,
      weekLabel,
      proposedCount: proposedEdit ?? 0
    }
  };
}

export async function loadPublishOverview(
  supabase: SupabaseClient,
  brand: BrandRow
): Promise<PublishOverview> {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  // Upgrade banner for autopublish / social connects — not Web hub (free matches Go).
  const paid = isPaidPlan(brand.plan);

  const [
    { data: posts },
    { data: pendingPreview },
    { count: upcoming },
    { data: campaignRows },
    { count: trackedPosts },
    { data: competitorRows },
    { data: articles }
  ] = await Promise.all([
    supabase.from('posts').select('status').eq('brand_id', brand.id),
    supabase
      .from('posts')
      .select('id, platform, caption, media_url, format')
      .eq('brand_id', brand.id)
      .eq('status', 'pending_user')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'scheduled')
      .gte('scheduled_for', now.toISOString())
      .lte('scheduled_for', weekAhead.toISOString()),
    supabase
      .from('posts')
      .select('campaign_id')
      .eq('brand_id', brand.id)
      .not('campaign_id', 'is', null),
    supabase
      .from('social_post_history')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id),
    supabase.from('competitors').select('id, top_posts').eq('brand_id', brand.id),
    paid
      ? supabase.from('brand_articles').select('status').eq('brand_id', brand.id)
      : Promise.resolve({ data: null })
  ]);

  const counts = { pending: 0, scheduled: 0, failed: 0, published: 0 };
  for (const p of posts ?? []) {
    const s = String(p.status ?? '');
    if (s === 'pending_user') counts.pending++;
    else if (s === 'scheduled') counts.scheduled++;
    else if (s === 'failed') counts.failed++;
    else if (s === 'published') counts.published++;
  }

  const campaignIds = new Set((campaignRows ?? []).map((r) => r.campaign_id).filter(Boolean));
  const competitorPostCount = (competitorRows ?? []).reduce((n, r) => {
    return n + (Array.isArray(r.top_posts) ? r.top_posts.length : 0);
  }, 0);

  const previewPosts: PendingPostPreview[] = (pendingPreview ?? []).map((p) => ({
    id: p.id as string,
    platform: p.platform ? String(p.platform) : null,
    caption: p.caption ? String(p.caption) : null,
    media_url: p.media_url ? String(p.media_url) : null,
    format: p.format ? String(p.format) : null
  }));

  let blogPending = 0;
  for (const a of articles ?? []) {
    if (a.status === 'draft' || a.status === 'approved') blogPending++;
  }

  return {
    paid,
    queue: {
      pending: counts.pending,
      scheduled: counts.scheduled,
      failed: counts.failed,
      posts: previewPosts
    },
    calendar: { upcoming: upcoming ?? 0 },
    campaigns: { count: campaignIds.size },
    analytics: { published: counts.published, trackedPosts: trackedPosts ?? 0 },
    competitors: { count: (competitorRows ?? []).length, posts: competitorPostCount },
    web: { blogPending }
  };
}

export async function loadWebOverview(
  supabase: SupabaseClient,
  brand: BrandRow & { blog_config?: unknown }
): Promise<WebOverview> {
  const paid = hasWebHub(brand.plan);
  if (!paid) {
    return {
      paid: false,
      network: { enabled: false, outgoing: 0, incoming: 0, openOpportunities: 0 },
      library: { pages: 0 },
      blog: { enabled: false, articles: 0, published: 0, pending: 0, domains: 0 }
    };
  }

  const [
    { count: libraryPages },
    { data: articles },
    { count: domains },
    { data: brandRow },
    { count: netOut },
    { count: netIn },
    { count: netOpp }
  ] = await Promise.all([
    supabase
      .from('brand_pages')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('active', true),
    supabase.from('brand_articles').select('status').eq('brand_id', brand.id),
    supabase
      .from('brand_sites')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id),
    supabase.from('brands').select('blog_config').eq('id', brand.id).maybeSingle(),
    supabase
      .from('brand_backlink_placements')
      .select('id', { count: 'exact', head: true })
      .eq('source_brand_id', brand.id)
      .neq('status', 'removed'),
    supabase
      .from('brand_backlink_placements')
      .select('id', { count: 'exact', head: true })
      .eq('target_brand_id', brand.id)
      .neq('status', 'removed'),
    supabase
      .from('brand_backlink_opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'open')
  ]);

  let published = 0;
  let pending = 0;
  for (const a of articles ?? []) {
    if (a.status === 'published') published++;
    else if (a.status === 'draft' || a.status === 'approved') pending++;
  }
  const blogCfg = (brandRow?.blog_config ?? brand.blog_config) as { enabled?: boolean } | null;

  return {
    paid: true,
    network: {
      enabled: hasBacklinkNetwork(brand.plan) &&
        (brandRow?.blog_config as { backlinkNetwork?: boolean } | null)?.backlinkNetwork !== false,
      outgoing: netOut ?? 0,
      incoming: netIn ?? 0,
      openOpportunities: netOpp ?? 0
    },
    library: { pages: libraryPages ?? 0 },
    blog: {
      enabled: blogCfg?.enabled === true,
      articles: articles?.length ?? 0,
      published,
      pending,
      domains: domains ?? 0
    }
  };
}

export type PostFactRow = {
  status?: string | null;
  scheduled_for?: string | null;
};

export type PostCounts = { pending: number; scheduled: number; published: number };

export function derivePostCounts(rows: PostFactRow[] | null | undefined): PostCounts {
  const out: PostCounts = { pending: 0, scheduled: 0, published: 0 };
  for (const row of rows ?? []) {
    const status = String(row.status ?? '');
    if (status === 'pending_user') out.pending++;
    else if (status === 'scheduled') out.scheduled++;
    else if (status === 'published') out.published++;
  }
  return out;
}

export type BlogFactRow = {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  cover_image?: string | null;
  scheduled_for?: string | null;
};

/**
 * Articles that will auto-publish: approved AND holding a slot that has not passed.
 * Drafts with a slot are deliberately excluded — they still need a human — which mirrors
 * the `status = 'approved'` filter of the two queries this replaces.
 *
 * Timestamps compare as ISO strings, which is only sound because both sides are UTC ISO-8601
 * from Postgres; `nowIso` is built the same way by the caller.
 */
export function deriveUpcomingBlogs(
  rows: BlogFactRow[] | null | undefined,
  nowIso: string,
  limit = 5
): { count: number; previews: ScheduledBlogPreview[] } {
  const upcoming = (rows ?? [])
    .filter((a) => a.status === 'approved' && a.scheduled_for && String(a.scheduled_for) >= nowIso)
    .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
  return {
    count: upcoming.length,
    previews: upcoming.slice(0, limit).map((a) => ({
      id: a.id as string,
      title: a.title ? String(a.title) : null,
      cover_url: a.cover_image ? String(a.cover_image) : null,
      scheduled_for: String(a.scheduled_for)
    }))
  };
}

export async function loadHomeOverview(
  supabase: SupabaseClient,
  brand: BrandRow & { blog_config?: unknown; name?: string },
  extras?: {
    studioPct?: number;
    strategySetup?: { gtm?: boolean; plan?: boolean };
    socialAccountCount?: number;
  }
): Promise<HomeOverview> {
  // Home upgrade CTA is for autopublish/socials; Web/Leads are unlocked on free.
  const paid = isPaidPlan(brand.plan);
  const webUnlocked = hasWebHub(brand.plan);
  // Snapshot metrics are lifetime totals on each post — there is no daily engagement series.
  // Overview therefore looks at posts published in the last 30 days (not 7): a 7-day publish
  // window was almost always empty, which made likes/views read as 0 even when the brand had
  // real engagement on slightly older posts. Sparkline below still buckets the last 7 days.
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const [
    { data: postFacts },
    { data: pendingPosts },
    { data: upcomingPosts },
    { count: trackedPosts },
    { data: recentHistoryRows },
    { data: lastStatsSync },
    { data: blogRows },
    { count: blogPublishedCount },
    { data: publishedPosts }
  ] = await Promise.all([
    // One index-only read answers every post COUNT this page shows (pending, scheduled,
    // published). It replaces separate head:true counts: each was individually fast after
    // migration 0204, but on a one-vCPU Postgres the cost that dominates is per-request
    // planning (~10-20 ms measured) and they contend with each other.
    // posts_brand_overview_idx (migration 0206) INCLUDEs these columns, so this reads no heap.
    supabase
      .from('posts')
      .select('status, scheduled_for')
      .eq('brand_id', brand.id),
    supabase
      .from('posts')
      .select('id, platform, caption, media_url, format')
      .eq('brand_id', brand.id)
      .eq('status', 'pending_user')
      .order('created_at', { ascending: false })
      // Overview paginates the review queue client-side — load enough rows for the list.
      .limit(100),
    supabase
      .from('posts')
      .select('id, platform, caption, media_url, scheduled_for')
      .eq('brand_id', brand.id)
      .eq('status', 'scheduled')
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', nowIso)
      .order('scheduled_for', { ascending: true })
      .limit(5),
    supabase
      .from('social_post_history')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id),
    supabase
      .from('social_post_history')
      .select('source, platform, platform_post_url, content, metrics, published_at')
      .eq('brand_id', brand.id)
      .gte('published_at', monthAgo)
      .order('published_at', { ascending: false })
      .limit(300),
    supabase
      .from('social_post_history')
      .select('synced_at')
      .eq('brand_id', brand.id)
      .not('synced_at', 'is', null)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Pending blogs to review: all drafts (even if they have a tentative slot),
    // plus approved articles that are not yet scheduled.
    // Draft + approved articles in one read. The upcoming-preview rows and the
    // scheduled count are both derived from it below (an approved article with a future
    // slot is exactly the "will auto-publish" set), which is three round trips saved.
    // `published` stays its own count: it is the one figure not derivable from this set,
    // and deriving it would mean fetching every article a brand has ever published.
    supabase
      .from('brand_articles')
      .select('id, title, status, cover_image, scheduled_for')
      .eq('brand_id', brand.id)
      .in('status', ['draft', 'approved'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('brand_articles')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'published'),
    // Gli ultimi post usciti, con la foto. Sei e non di piu': la striscia della home ne mostra
    // quattro e i due di scorta coprono quelli senza immagine, che nella striscia non entrano.
    supabase
      .from('posts')
      .select('id, platform, caption, media_url, published_at')
      .eq('brand_id', brand.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(6)
  ]);

  const postCounts = derivePostCounts(postFacts as PostFactRow[] | null);

  // Brands that have not published in 30 days still have tracked history (onboarding scrape /
  // older dazero posts). Fall back to the latest rows so Overview does not show 0 forever.
  let historyRows = (recentHistoryRows ?? []) as SocialHistoryRow[];
  if (!historyRows.length) {
    const { data: fallback } = await supabase
      .from('social_post_history')
      .select('source, platform, platform_post_url, content, metrics, published_at')
      .eq('brand_id', brand.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(100);
    historyRows = (fallback ?? []) as SocialHistoryRow[];
  }

  const engagement = aggregateRecentEngagement(historyRows);

  const posts = (pendingPosts ?? []).map((p) => ({
    id: p.id as string,
    platform: p.platform ? String(p.platform) : null,
    caption: p.caption ? String(p.caption) : null,
    media_url: p.media_url ? String(p.media_url) : null,
    format: p.format ? String(p.format) : null
  }));

  const upcomingPostPreviews: ScheduledPostPreview[] = (upcomingPosts ?? [])
    .filter((p) => p.scheduled_for)
    .map((p) => ({
      id: p.id as string,
      platform: p.platform ? String(p.platform) : null,
      caption: p.caption ? String(p.caption) : null,
      media_url: p.media_url ? String(p.media_url) : null,
      scheduled_for: String(p.scheduled_for)
    }));

  const publishedPostPreviews: PublishedPostPreview[] = (publishedPosts ?? []).map((p) => ({
    id: p.id as string,
    platform: p.platform ? String(p.platform) : null,
    caption: p.caption ? String(p.caption) : null,
    media_url: p.media_url ? String(p.media_url) : null,
    published_at: p.published_at ? String(p.published_at) : null
  }));

  // Exclude already-approved+scheduled articles from the review queue.
  // Return the full pending set — Overview shows a 5-item preview, then paginates on expand.
  const pendingBlogs: PendingBlogPreview[] = (blogRows ?? [])
    .filter((a) => {
      if (a.status === 'draft') return true;
      if (a.status === 'approved' && !a.scheduled_for) return true;
      return false;
    })
    .map((a) => ({
      id: a.id as string,
      title: a.title ? String(a.title) : null,
      status: String(a.status),
      cover_url: a.cover_image ? String(a.cover_image) : null
    }));

  // "Will auto-publish" = approved with a slot still ahead of us. Both the preview and the
  // count come out of `blogRows`, which already contains every draft and approved article.
  const { count: scheduledBlogCount, previews: upcomingBlogPreviews } = deriveUpcomingBlogs(
    blogRows as BlogFactRow[] | null,
    nowIso
  );

  // blog_config rides on the brand row the layout already loaded (BRAND_SHELL_SELECT),
  // so this no longer re-reads `brands` for it.
  const blogCfg = brand.blog_config as { enabled?: boolean } | null;

  return {
    paid,
    setup: {
      studioPct: extras?.studioPct ?? 0,
      hasStrategy: extras?.strategySetup?.gtm ?? false,
      hasEditorialPlan: extras?.strategySetup?.plan ?? false,
      blogEnabled: blogCfg?.enabled === true,
      socialAccounts: extras?.socialAccountCount ?? 0
    },
    queue: {
      pending: postCounts.pending,
      scheduled: postCounts.scheduled,
      posts,
      upcoming: upcomingPostPreviews,
      published: publishedPostPreviews
    },
    blog: {
      pending: pendingBlogs.length,
      published: blogPublishedCount ?? 0,
      scheduled: scheduledBlogCount,
      articles: pendingBlogs,
      upcoming: upcomingBlogPreviews
    },
    analysis: {
      published: postCounts.published,
      trackedPosts: trackedPosts ?? 0,
      views7d: engagement.views,
      likes7d: engagement.likes,
      viewsByDay: engagement.viewsByDay,
      likesByDay: engagement.likesByDay,
      statsUpdatedAt: lastStatsSync?.synced_at ? String(lastStatsSync.synced_at) : null
    }
  };
}

export async function loadBrandOverview(
  supabase: SupabaseClient,
  brand: BrandRow
): Promise<BrandOverview> {
  const [
    { data: kit },
    { count: productCount },
    { count: competitorCount },
    { count: historyCount },
    { count: documentCount },
    { data: lastDoc },
    { count: memoryCount },
    { count: pinnedCount },
    { count: pendingCount },
    { count: failedCount },
    { data: chunkSumRows },
    { count: mediaCount },
    { count: mediaReady },
    { count: rubricCount },
    { count: liveIdeaCount }
  ] = await Promise.all([
    supabase
      .from('brand_kit')
      .select('about, target_audience, brand_style, ai_character, brand_colors, logos, visual_style')
      .eq('brand_id', brand.id)
      .maybeSingle(),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id),
    supabase.from('competitors').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id),
    supabase
      .from('social_post_history')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id),
    supabase
      .from('brand_documents')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .neq('kind', 'image'),
    supabase
      .from('brand_documents')
      .select('created_at')
      .eq('brand_id', brand.id)
      .neq('kind', 'image')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('brand_memory').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id),
    supabase
      .from('brand_memory')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('pinned', true),
    supabase
      .from('brand_documents')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'pending')
      .neq('kind', 'image'),
    supabase
      .from('brand_documents')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'failed')
      .neq('kind', 'image'),
    supabase.from('brand_documents').select('chunk_count').eq('brand_id', brand.id).neq('kind', 'image'),
    supabase.from('brand_media').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id),
    supabase
      .from('brand_media')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('catalog_status', 'ready'),
    supabase
      .from('rubrics')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      // 'active' non e uno status di `rubrics` (proposed|approved|superseded|rejected): il
      // conteggio tornava 0 per ogni brand, in silenzio. Le rubriche vive sono le approvate.
      .eq('status', 'approved'),
    supabase
      .from('disruptive_ideas')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .in('status', ['new', 'shortlisted'])
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const character = (kit?.ai_character ?? {}) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logos = (kit?.logos ?? []) as any[];
  const hasLogo = logos.some((l) => l?.url && l?.type !== 'og-image');
  const colors = Array.isArray(kit?.brand_colors) ? (kit!.brand_colors as unknown[]).length : 0;
  const completionPct = studioCompleteness({
    products: productCount ?? 0,
    history: historyCount ?? 0,
    documents: documentCount ?? 0,
    voice: !!(character.tone || character.speaking_style || kit?.brand_style),
    about: !!kit?.about,
    audience: !!kit?.target_audience,
    logo: hasLogo,
    colors: colors > 0
  }).pct;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefs = (brand.content_prefs ?? {}) as any;
  const voiceExamples = Array.isArray(prefs.voiceExamples) ? prefs.voiceExamples.length : 0;
  const chunks = (chunkSumRows ?? []).reduce(
    (n, r) => n + (typeof r.chunk_count === 'number' ? r.chunk_count : 0),
    0
  );

  return {
    identity: {
      completionPct,
      hasLogo,
      colors,
      products: productCount ?? 0,
      competitors: competitorCount ?? 0
    },
    knowledge: {
      documents: documentCount ?? 0,
      pending: pendingCount ?? 0,
      failed: failedCount ?? 0,
      chunks,
      memories: memoryCount ?? 0,
      pinned: pinnedCount ?? 0,
      lastIngestAt: lastDoc?.created_at ?? null
    },
    media: { assets: mediaCount ?? 0, ready: mediaReady ?? 0 },
    voice: {
      examples: voiceExamples,
      hasVisualStyle: !!kit?.visual_style
    },
    rubrics: { count: rubricCount ?? 0 },
    ideas: { live: liveIdeaCount ?? 0 }
  };
}
