// Hosted SEO pages (landing / comparison / glossary / programmatic) on the brand site.
import { swallow } from '$lib/server/swallow';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { isPublishVerifyEnabled } from '$lib/server/feature-flags';

type AnyRec = Record<string, unknown>;

export function canPublishSitePages(plan: string | null | undefined): boolean {
  return plan === 'starter' || plan === 'pro' || plan === 'scale';
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'page';
}

/** Strip a leading markdown H1 so the page template can own the single H1. */
export function stripLeadingMarkdownH1(bodyMd: string): string {
  return String(bodyMd ?? '')
    .replace(/^\s*#\s+[^\n]+\n+/, '')
    .trim();
}

/** Plain-text-ish description from markdown (no headings/links markup). */
export function metaDescriptionFromBody(bodyMd: string, max = 160): string {
  const text = String(bodyMd ?? '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}

/** Parse "Title: … / Meta description: …" block from SEO artifacts. */
export type SitePage = {
  id: string;
  kind: string;
  slug: string;
  title: string;
  body_md: string;
  target_query: string | null;
  status: string;
  initiative_id: string | null;
  seo_meta: AnyRec;
  published_at: string | null;
};

export type PublishedSitePage = SitePage & { publicUrl: string };

export type UrlLiveResult = {
  ok: boolean;
  status: number | null;
  finalUrl: string;
  soft?: boolean;
  error?: string;
};

/** Create or update a draft page from an SEO initiative asset. */
/**
 * Absolute public URL for a hosted site page.
 * Custom domain (`brand_sites`) → `/p/{slug}`; else app host → `/blog/{blog_slug}/p/{slug}`.
 */
export async function resolveSitePagePublicUrl(
  admin: SupabaseClient,
  brandId: string,
  slug: string
): Promise<string | null> {
  const { data: site } = await admin
    .from('brand_sites')
    .select('host')
    .eq('brand_id', brandId)
    .eq('verified', true)
    .limit(1)
    .maybeSingle();
  if (site?.host) return `https://${site.host}/p/${slug}`;

  const { data: b } = await admin.from('brands').select('blog_slug, id').eq('id', brandId).maybeSingle();
  const app = (publicEnv.PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (!app || !b) return null;
  return `${app}/blog/${b.blog_slug || b.id}/p/${slug}`;
}

export function isAppHostedSitePageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /\/blog\/[^/]+\/p\/[^/]+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** App-hosted blog article or site page under `/blog/{site}/…` (not a custom domain). */
export function isAppHostedContentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /^\/blog\/[^/]+\/.+/.test(u.pathname);
  } catch {
    return false;
  }
}

/** HTTP check that a public URL responds 200. Soft-ok for app-hosted paths if DB already published. */
export async function assertPublicUrlLive(
  url: string,
  opts?: { softDbOk?: boolean; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<UrlLiveResult> {
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': 'dazeroPublishVerify/1.0' }
    });
    const finalUrl = res.url || url;
    if (res.ok) {
      const text = await res.text().catch(() => '');
      if (!text.trim()) {
        return { ok: false, status: res.status, finalUrl, error: 'Empty response body' };
      }
      return { ok: true, status: res.status, finalUrl };
    }
    if (opts?.softDbOk && isAppHostedContentUrl(url)) {
      return {
        ok: true,
        status: res.status,
        finalUrl,
        soft: true,
        error: `HTTP ${res.status}; accepted soft (app-hosted + DB published)`
      };
    }
    return { ok: false, status: res.status, finalUrl, error: `HTTP ${res.status}` };
  } catch (e) {
    if (opts?.softDbOk && isAppHostedContentUrl(url)) {
      return {
        ok: true,
        status: null,
        finalUrl: url,
        soft: true,
        error: e instanceof Error ? e.message : String(e)
      };
    }
    return {
      ok: false,
      status: null,
      finalUrl: url,
      error: e instanceof Error ? e.message : String(e)
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function publishSitePage(
  admin: SupabaseClient,
  brand: AnyRec,
  pageId: string
): Promise<PublishedSitePage> {
  if (!canPublishSitePages(brand.plan as string)) {
    throw new Error('Publishing site pages requires Starter or above');
  }

  const { data, error } = await admin
    .from('brand_site_pages')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', pageId)
    .eq('brand_id', brand.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const publicUrl = await resolveSitePagePublicUrl(admin, String(brand.id), data.slug);
  if (!publicUrl) {
    await revertToDraft(admin, String(brand.id), pageId);
    throw new Error('Could not resolve a public URL for this page (missing blog slug / app URL)');
  }

  // Persist canonical on seo_meta for the public template
  const seo_meta = {
    ...((data.seo_meta as AnyRec) ?? {}),
    canonical: publicUrl
  };
  await admin
    .from('brand_site_pages')
    .update({ seo_meta, updated_at: new Date().toISOString() })
    .eq('id', pageId)
    .eq('brand_id', brand.id);

  if (isPublishVerifyEnabled()) {
    const live = await assertPublicUrlLive(publicUrl, { softDbOk: true });
    if (!live.ok) {
      await revertToDraft(admin, String(brand.id), pageId);
      throw new Error(
        `Published URL is not reachable (${live.error ?? 'unknown'}). Fix hosting/DNS and retry: ${publicUrl}`
      );
    }
  }

  return { ...(data as SitePage), seo_meta, publicUrl };
}

async function revertToDraft(admin: SupabaseClient, brandId: string, pageId: string) {
  await admin
    .from('brand_site_pages')
    .update({
      status: 'draft',
      published_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', pageId)
    .eq('brand_id', brandId);
}

export async function listSitePages(admin: SupabaseClient, brandId: string) {
  const { data } = await admin
    .from('brand_site_pages')
    .select('id, kind, slug, title, target_query, status, initiative_id, published_at, updated_at')
    .eq('brand_id', brandId)
    .order('updated_at', { ascending: false });
  return data ?? [];
}

export async function getPublishedSitePage(
  admin: SupabaseClient,
  brandId: string,
  slug: string
): Promise<SitePage | null> {
  const { data } = await admin
    .from('brand_site_pages')
    .select('*')
    .eq('brand_id', brandId)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  return (data as SitePage) ?? null;
}

/** Publish from SEO artifact body (source_finding seo:<initiativeId>). */
