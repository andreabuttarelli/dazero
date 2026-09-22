/**
 * Shared query functions for CLI API endpoints.
 * These can also be reused by +page.server.ts files to avoid duplication.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { redactJson } from '$lib/server/redact';

// ── Brand list ──────────────────────────────────────────────────────────

/** `onlyIds` scopes the list for API-key auth (service-role client, no RLS); null = RLS-scoped client. */
export async function getBrandsList(supabase: SupabaseClient, onlyIds: string[] | null = null) {
  if (onlyIds && !onlyIds.length) return [];
  let q = supabase
    .from('brands')
    .select('id, name, slug, plan, status, timezone');
  if (onlyIds) q = q.in('id', onlyIds);
  const { data: brands } = await q.order('name');

  if (!brands?.length) return [];

  const ids = brands.map(b => b.id);
  const { data: posts } = await supabase
    .from('posts').select('brand_id').in('brand_id', ids).eq('status', 'pending_user');

  const pendingCounts = new Map<string, number>();
  for (const p of posts ?? []) pendingCounts.set(p.brand_id, (pendingCounts.get(p.brand_id) ?? 0) + 1);

  return brands.map(b => ({
    ...b,
    pendingCount: pendingCounts.get(b.id) ?? 0,
  }));
}

// ── Brand detail ────────────────────────────────────────────────────────

export async function getBrandDetail(supabase: SupabaseClient, brandId: string) {
  const [pendingRes, runsRes, productsRes, accountsRes, postsStatusRes, historyRes, kitRes] = await Promise.all([
    supabase.from('posts').select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId).eq('status', 'pending_user'),
    supabase.from('scheduler_runs').select('status, posts_created, created_at, error')
      .eq('brand_id', brandId).order('created_at', { ascending: false }).limit(3),
    supabase.from('products').select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId),
    supabase.from('social_accounts').select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId),
    supabase.from('posts').select('status').eq('brand_id', brandId),
    supabase.from('social_post_history').select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId),
    supabase.from('brand_kit').select('about, brand_colors, logos, favicon_url')
      .eq('brand_id', brandId).maybeSingle(),
  ]);

  const statusCounts = new Map<string, number>();
  for (const row of postsStatusRes.data ?? []) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }

  const kit = kitRes.data;
  const logos = (kit?.logos as Array<{ url?: string }> | null) ?? null;
  const logoUrl = logos?.find(l => l?.url)?.url ?? kit?.favicon_url ?? null;

  return {
    pendingCount: pendingRes.count ?? 0,
    runs: runsRes.data ?? [],
    productCount: productsRes.count ?? 0,
    accountCount: accountsRes.count ?? 0,
    scheduledCount: statusCounts.get('scheduled') ?? 0,
    publishedCount: statusCounts.get('published') ?? 0,
    hasHistory: (historyRes.count ?? 0) > 0,
    kit: kit ? { about: kit.about, brand_colors: kit.brand_colors } : null,
    logoUrl,
  };
}

// ── Posts ───────────────────────────────────────────────────────────────

export async function getPosts(supabase: SupabaseClient, brandId: string, status?: string) {
  let query = supabase
    .from('posts')
    .select('id, brand_id, platform, platforms, caption, image_prompt, slot, media_url, status, content_type, scheduled_for, published_url, product_name, revisions_count, pillar, format, created_at')
    .eq('brand_id', brandId);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data } = await query.order('created_at', { ascending: false }).limit(50);
  return data ?? [];
}

// ── Analytics ───────────────────────────────────────────────────────────

export async function getAnalytics(supabase: SupabaseClient, brandId: string, brandTimezone: string) {
  const [postsRes, upcomingRes, logsRes, historyRes, productsRes, accountsRes] = await Promise.all([
    supabase.from('posts').select('platform, status').eq('brand_id', brandId),
    supabase.from('posts').select('id, platform, caption, slot, media_url, scheduled_for')
      .eq('brand_id', brandId).eq('status', 'scheduled')
      .gte('scheduled_for', new Date().toISOString())
      .lte('scheduled_for', new Date(Date.now() + 7 * 86400000).toISOString())
      .order('scheduled_for', { ascending: true }).limit(10),
    supabase.from('publish_logs')
      .select('id, post_id, platform, status, error, created_at, posts ( caption, media_url )')
      .eq('brand_id', brandId).order('created_at', { ascending: false }).limit(8),
    supabase.from('social_post_history')
      .select('id, platform, content, thumbnail_url, platform_post_url, published_at, metrics')
      .eq('brand_id', brandId).order('published_at', { ascending: false }).limit(200),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
    supabase.from('social_accounts').select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId).eq('status', 'active'),
  ]);

  // Status counts
  const statusCounts = new Map<string, number>();
  for (const row of postsRes.data ?? []) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);

  // Platform counts
  const platformCounts = new Map<string, number>();
  for (const row of postsRes.data ?? []) {
    if (row.platform) platformCounts.set(row.platform, (platformCounts.get(row.platform) ?? 0) + 1);
  }

  // Social performance per platform
  const byPlat = new Map<string, { views: number; likes: number; comments: number; shares: number; count: number }>();
  for (const p of historyRes.data ?? []) {
    const m = (p.metrics ?? {}) as Record<string, number>;
    const cur = byPlat.get(p.platform ?? '') ?? { views: 0, likes: 0, comments: 0, shares: 0, count: 0 };
    byPlat.set(p.platform ?? '', {
      views: cur.views + (m.views ?? 0),
      likes: cur.likes + (m.likes ?? 0),
      comments: cur.comments + (m.comments ?? 0),
      shares: cur.shares + (m.shares ?? 0),
      count: cur.count + 1,
    });
  }

  // Top posts by weighted engagement
  const topPosts = [...(historyRes.data ?? [])]
    .map(p => {
      const m = (p.metrics ?? {}) as Record<string, number>;
      return {
        id: p.id,
        platform: p.platform,
        content: p.content,
        thumbnail_url: p.thumbnail_url,
        url: p.platform_post_url,
        published_at: p.published_at,
        metrics: m,
        score: (m.likes ?? 0) + (m.comments ?? 0) * 2 + (m.shares ?? 0) * 3 + (m.views ?? 0) * 0.01,
      };
    })
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    total: (postsRes.data ?? []).length,
    scheduled: statusCounts.get('scheduled') ?? 0,
    pending: statusCounts.get('pending_user') ?? 0,
    failed: statusCounts.get('failed') ?? 0,
    platforms: [...platformCounts.entries()].sort((a, b) => b[1] - a[1]),
    upcomingPosts: (upcomingRes.data ?? []).map(p => ({
      id: p.id,
      platform: p.platform,
      caption: p.caption,
      scheduled_for: p.scheduled_for,
      slot: p.slot,
    })),
    recentActivity: (logsRes.data ?? []).map(l => ({
      id: l.id,
      post_id: l.post_id,
      platform: l.platform,
      status: l.status,
      caption: (l.posts as any)?.caption ?? null,
      error: l.error,
      created_at: l.created_at,
    })),
    socialPerformance: [...byPlat.entries()].map(([platform, d]) => ({
      platform,
      posts: d.count,
      totals: { views: d.views, likes: d.likes, comments: d.comments, shares: d.shares },
    })).sort((a, b) => b.posts - a.posts),
    topPosts: topPosts.map(p => ({
      id: p.id,
      platform: p.platform,
      caption: p.content,
      thumbnail_url: p.thumbnail_url,
      url: p.url,
      published_at: p.published_at,
      metrics: p.metrics,
    })),
    products: productsRes.count ?? 0,
    accounts: accountsRes.count ?? 0,
  };
}

// ── Voice ───────────────────────────────────────────────────────────────

export async function getVoice(supabase: SupabaseClient, brandId: string) {
  const { data: brand } = await supabase
    .from('brands').select('target_platforms, content_prefs').eq('id', brandId).maybeSingle();

  const prefs = (brand?.content_prefs ?? {}) as Record<string, unknown>;

  // Studio completeness
  const [kitRes, prodRes, histRes, docsRes] = await Promise.all([
    supabase.from('brand_kit').select('ai_character').eq('brand_id', brandId).maybeSingle(),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
    supabase.from('social_post_history').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
    supabase.from('brand_documents').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
  ]);
  const checks = [
    (prodRes.count ?? 0) > 0, (histRes.count ?? 0) > 0, !!kitRes.data?.ai_character,
    false, false, false, false, (docsRes.count ?? 0) > 0,
  ];
  const studioPct = Math.round((checks.filter(Boolean).length / 8) * 100);

  return {
    platforms: (brand?.target_platforms as string[]) ?? [],
    voiceMode: String(prefs.voiceMode ?? 'auto'),
    voiceFramework: (prefs.voiceFramework ?? {}) as Record<string, unknown>,
    platformRules: (prefs.platformRules ?? {}) as Record<string, Record<string, unknown>>,
    avoid: Array.isArray(prefs.avoid) ? prefs.avoid : typeof prefs.avoid === 'string' ? prefs.avoid.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    platformInstructions: (prefs.platformInstructions ?? {}) as Record<string, string>,
    studioPct,
  };
}

// ── Calendar ────────────────────────────────────────────────────────────

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function getCalendar(supabase: SupabaseClient, brandId: string, brandTimezone: string, year: number, month: number, brandLanguage: string | null = null) {
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startStr = isoDate(year, month, 1);
  const endStr = isoDate(year, month, lastDayOfMonth);

  const [schedRes, slotRes, draftRes] = await Promise.all([
    supabase.from('posts')
      .select('id, platform, caption, media_url, scheduled_for, status, slot')
      .eq('brand_id', brandId)
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', `${startStr}T00:00:00`).lte('scheduled_for', `${endStr}T23:59:59`)
      .order('scheduled_for', { ascending: true }).limit(100),
    supabase.from('posts')
      .select('id, platform, caption, media_url, scheduled_for, status, slot')
      .eq('brand_id', brandId).not('status', 'eq', 'pending_user')
      .not('slot', 'is', null)
      .gte('slot', startStr).lte('slot', endStr)
      .order('slot', { ascending: true }).limit(100),
    supabase.from('posts')
      .select('id, platform, caption, media_url, scheduled_for, status, slot')
      .eq('brand_id', brandId).eq('status', 'pending_user')
      .is('scheduled_for', null)
      .limit(50),
  ]);

  // Merge and deduplicate
  const allMap = new Map<string, Record<string, unknown>>();
  for (const p of schedRes.data ?? []) allMap.set(p.id, p as Record<string, unknown>);
  for (const p of slotRes.data ?? []) if (!allMap.has(p.id)) allMap.set(p.id, p as Record<string, unknown>);
  for (const p of draftRes.data ?? []) allMap.set(p.id, { ...p, isDraft: true } as Record<string, unknown>);

  const monthLabel = new Date(year, month - 1).toLocaleDateString(localeForLanguage(brandLanguage), { month: 'long', year: 'numeric' });

  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);

  return {
    posts: [...allMap.values()],
    year,
    month,
    monthLabel,
    prevYM: `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`,
    nextYM: `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`,
    timezone: brandTimezone,
  };
}

/** Map a brand language (e.g. "it", "en-US") to a date-fns-style locale tag for toLocaleDateString. */
function localeForLanguage(language: string | null): string {
  const base = (language ?? '').split('-')[0].toLowerCase();
  const locales: Record<string, string> = {
    it: 'it-IT',
    en: 'en-US',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    pt: 'pt-PT'
  };
  return locales[base] ?? 'en-US';
}

// ── Approve ─────────────────────────────────────────────────────────────

export async function approvePost(supabase: SupabaseClient, brandId: string, postId: string, brandTimezone: string, actorId?: string) {
  const { data: post, error } = await supabase
    .from('posts').select('*').eq('id', postId).eq('brand_id', brandId).maybeSingle();
  if (error || !post) return { error: 'Post not found' };

  if (post.status !== 'pending_user') return { error: `Post is ${post.status}, not pending_user` };

  // Import publish logic dynamically
  const { publishApprovedPost } = await import('$lib/server/publish');
  try {
    const res = await publishApprovedPost(supabase, post, brandTimezone, { by: actorId });
    // Nothing scheduled but something failed → over-limit caption or Zernio rejection. Surface the
    // reason instead of a false "published" so the CLI/AI don't think it worked.
    if (res.scheduled === 0 && res.failed > 0) {
      return { error: res.error ?? 'Publish failed — the post did not meet platform requirements.' };
    }
    // Nothing scheduled and nothing failed → no connected account for the post's platform. The post
    // stays 'approved', waiting for the connection: reporting 'published' here is a false success
    // the CLI/AI would repeat back to the user.
    if (res.noAccount) {
      return { ok: true, status: 'approved', noAccount: true, message: 'Approved, but not scheduled: no connected account for this platform yet.' };
    }
    return { ok: true, status: 'published' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Publish failed' };
  }
}

export async function approveAllPosts(supabase: SupabaseClient, brandId: string, brandTimezone: string, actorId?: string) {
  // Never bulk-publish Director-flagged posts (needs_attention) — same rule as the token page.
  const { data: pending } = await supabase
    .from('posts').select('*').eq('brand_id', brandId).eq('status', 'pending_user')
    .or('needs_attention.is.null,needs_attention.eq.false')
    .order('slot', { ascending: true, nullsFirst: false });

  if (!pending?.length) return { results: [], message: 'No pending posts' };

  const { publishApprovedPost } = await import('$lib/server/publish');
  const results: { id: string; ok: boolean; error?: string; noAccount?: boolean }[] = [];

  for (const post of pending) {
    try {
      const res = await publishApprovedPost(supabase, post, brandTimezone, { by: actorId });
      if (res.scheduled === 0 && res.failed > 0) {
        results.push({ id: post.id, ok: false, error: res.error ?? 'Did not meet platform requirements' });
      } else {
        // Same rule as approvePost: approved but unscheduled (no connected account) is not a publish.
        results.push({ id: post.id, ok: true, ...(res.noAccount ? { noAccount: true } : {}) });
      }
    } catch (e) {
      results.push({ id: post.id, ok: false, error: e instanceof Error ? e.message : 'Failed' });
    }
  }

  return { results };
}

// ── Web ────────────────────────────────────────────────────────────────

/** Blog articles — drafts INCLUDED (unlike the headless /articles endpoint, which is published-only). */
export async function getWeb(supabase: SupabaseClient, brandId: string, status?: string) {
  let q = supabase.from('brand_articles')
    .select('id, slug, title, meta_title, meta_description, status, scheduled_for, published_at, source_initiative_id, created_at')
    .eq('brand_id', brandId).order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return { articles: data ?? [] };
}

// ── Usage / Quota ───────────────────────────────────────────────────────

export async function getUsage(supabase: SupabaseClient, brandId: string) {
  const { data } = await supabase
    .from('brand_usage').select('posts_count, videos_count')
    .eq('brand_id', brandId).order('month', { ascending: false }).limit(1);

  return {
    postsUsed: data?.[0]?.posts_count ?? 0,
    videosUsed: data?.[0]?.videos_count ?? 0,
  };
}

/**
 * `system_prompt` NON è nell'elenco, ed è deliberato: contiene i dati del brand, l'email
 * dell'utente e lo `stripe_customer_id`, arriva a 148.295 caratteri, e `renderRunTrace` non l'ha
 * mai reso. Non è una questione di redazione — è che non serve a capire una run.
 *
 * `viewer` è il perimetro: nessuna traccia è più pubblica della conversazione che trascrive, e
 * `agent_sessions` (a differenza di `chat_messages`) non ha una policy per utente. Omettendolo si
 * torna al comportamento vecchio, quindi i chiamanti lo passano sempre.
 */
export async function getAgentSession(
  supabase: SupabaseClient,
  brandId: string,
  id: string,
  viewer?: { userId: string; isOwner?: boolean }
) {
  let q = supabase
    .from('agent_sessions')
    .select(
      'id, brand_id, user_id, thread_id, job_id, agent, mode, surface, status, model, provider, transcript, events, event_count, error, format_version, created_at, updated_at, finished_at'
    )
    .eq('brand_id', brandId)
    .eq('id', id);
  if (viewer) {
    q = viewer.isOwner ? q.or(`user_id.eq.${viewer.userId},user_id.is.null`) : q.eq('user_id', viewer.userId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.warn('[cli-queries] agent_session', error.message);
    return null;
  }
  // Cintura in lettura: le righe scritte prima del 22/8/2026 non sono redatte alla scrittura.
  return data ? (redactJson(data, brandId) ?? null) : null;
}
