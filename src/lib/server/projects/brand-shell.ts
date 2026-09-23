import { error } from '@sveltejs/kit';

/**
 * LE COLONNE DI `brands` SULLO SCHEMA NUOVO — vedi `database.types.ts`. `status`, `plan`,
 * `timezone`, `target_platforms`, `launched_at`, `content_prefs`, `blog_config`, `ads_settings`,
 * `zernio_profile_id` erano dello schema vecchio e su questo progetto non esistono più: un
 * `select` che le nominava falliva con `42703` (colonna inesistente), l'errore veniva scartato
 * insieme a `data`, e `+layout.server.ts` restava con `brand: null` anche quando il brand
 * c'era — il difetto dietro "crea un brand" che sembrava non salvare niente.
 *
 * `ProjectBrandShell` resta con quei campi: ads/settings/calendar li leggono già (`brand.plan`,
 * `brand.ads_settings`…) e ognuna delle funzioni che li usa accetta già `null` — è la stessa
 * forma che il billing sullo schema nuovo non ha ancora, non un contratto da riscrivere qui.
 */
export const PROJECT_BRAND_SHELL_SELECT = 'id, org_id, name, slug, website';

type BrandShellRow = {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  website: string | null;
};

export type ProjectBrandShell = {
  id: string;
  org_id: string;
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

export function projectBrandShellOf(row: BrandShellRow): ProjectBrandShell {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    slug: row.slug,
    website: row.website,
    status: 'active',
    plan: null,
    timezone: 'UTC',
    target_platforms: null,
    launched_at: null,
    content_prefs: null,
    blog_config: null,
    ads_settings: null,
    zernio_profile_id: null
  };
}

export function requireBrand(brand: ProjectBrandShell | null): ProjectBrandShell {
  if (!brand) {
    throw error(400, 'questo progetto non ha un brand');
  }
  return brand;
}
