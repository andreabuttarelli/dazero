import type { RequestHandler } from './$types';
import { siteUrl, MARKETING_PATHS, STATIC_SITEMAP_PATHS } from '$lib/seo';
import { createAdminClient } from '$lib/server/supabase-admin';
import { hideMarketing } from '$lib/server/marketing-shell';
import { env } from '$env/dynamic/private';

// One <url> per public page. Static files (like /llms.txt) are included the same way.
export const GET: RequestHandler = async ({ url }) => {
  const site = siteUrl(url.origin);
  const loc = (p: string) => site + (p === '/' ? '/' : p);
  // Con HIDE_MARKETING le URL del pitch 303-ano in /app: elencarle nel sitemap è un
  // invito a indicizzare dei redirect. Restano solo i blog ospitati, che non sono marketing.
  const appOnly = hideMarketing();

  const marketingEntries = appOnly
    ? []
    : MARKETING_PATHS.map(
        (path) => `  <url>
    <loc>${loc(path)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
      );

  const staticEntries = appOnly
    ? []
    : STATIC_SITEMAP_PATHS.map(
        (path) => `  <url>
    <loc>${loc(path)}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>`
      );

  // The dynamic entries live in Postgres. Only the "admin key not configured" case degrades to a
  // static-only map: it is a structural state (CI smoke tier, minimal self-host), and a permanent
  // 500 would be worse. In production the key exists, so a real query failure still throws and
  // returns 500 — the crawler keeps its last good copy of the sitemap instead of seeing half
  // the dynamic URLs vanish (missing lastmod signals) for exactly one fetch.
  let blogs: { blog_slug: string }[] | null = null;
  if (!appOnly) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.from('brands').select('blog_slug').not('blog_slug', 'is', null);
      blogs = data;
    } catch (e) {
      if (env.SUPABASE_SERVICE_ROLE_KEY) throw e;
    }
  }
  const blogEntries = (blogs ?? []).map(
    (b) => `  <url>
    <loc>${site}/blog/${b.blog_slug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${marketingEntries.join('\n')}
${staticEntries.join('\n')}
${blogEntries.join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
};
