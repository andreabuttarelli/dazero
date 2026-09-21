import { env as publicEnv } from '$env/dynamic/public';

// Canonical site origin (no trailing slash). Prefer the configured PUBLIC_APP_URL (also used by
// the cron emails), fall back to the request origin, then to the production domain.
// Production serves www; the apex and the legacy domains 308 here. Keep FALLBACK in sync with the
// live host: a canonical/sitemap URL on a redirecting host is what makes strict crawlers report
// robots.txt as unfetchable.
function fallbackSite(): string {
  return publicEnv.PUBLIC_FALLBACK_APP_URL || 'https://www.dazero.co';
}

export function siteUrl(reqOrigin?: string): string {
  return (publicEnv.PUBLIC_APP_URL || reqOrigin || fallbackSite()).replace(/\/$/, '');
}

// Indexable public pages. Everything under /app is excluded.
export const MARKETING_PATHS = [
  '/privacy',
  '/terms',
  '/cookies',
  '/changelog',
  '/docs',
  '/docs/getting-started',
  '/docs/credits',
  '/docs/cli',
  '/docs/mcp',
  '/docs/api',
  '/docs/api/strategy',
  '/docs/api/analytics',
  '/docs/api/brands',
  '/docs/api/products',
  '/docs/api/posts',
  '/docs/api/studio',
  '/docs/api/editorial-plan',
  '/docs/api/articles',
  '/docs/agents',
  '/docs/brands',
  '/docs/editorial-plan',
  '/docs/studio',
  '/docs/brand-memory',
  '/docs/gtm-strategy',
  '/docs/thematic-calendar',
  '/docs/weekly-recap',
  '/docs/shopify',
  '/docs/content-library',
  '/docs/seo-advisor',
  '/docs/post-history',
  '/docs/geo-audit',
  '/docs/research',
  '/docs/blog-hosting',
  '/docs/webflow',
  '/docs/wix',
  '/docs/team-invites'
] as const;

/** Static files that should appear in the sitemap but aren't marketing HTML pages. */
export const STATIC_SITEMAP_PATHS = ['/llms.txt'] as const;

