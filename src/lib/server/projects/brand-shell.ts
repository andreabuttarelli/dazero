import { error } from '@sveltejs/kit';

export const PROJECT_BRAND_SHELL_SELECT =
  'id, name, slug, website, status, plan, timezone, target_platforms, launched_at, content_prefs, blog_config, ads_settings, zernio_profile_id';

export type ProjectBrandShell = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  status: string;
  plan: string | null;
  timezone: string;
  target_platforms: string[] | null;
  launched_at: string | null;
  content_prefs: Record<string, unknown> | null;
  blog_config: unknown;
  ads_settings: unknown;
  zernio_profile_id: string | null;
};

export function requireBrand(brand: ProjectBrandShell | null): ProjectBrandShell {
  if (!brand) {
    throw error(400, 'questo progetto non ha un brand');
  }
  return brand;
}
