/**
 * IL WIZARD DI CREAZIONE BRAND — sito → analisi → prodotti → target → concorrenti →
 * handle del brand → overview → approva.
 *
 * `brands.content` (markdown) È DOVE VIVONO TARGET, PALETTE, CONCORRENTI E HANDLE — non colonne
 * nuove, non tabelle nuove. `composeWizardContent` scrive quel markdown; `brand-content-chips.ts`
 * lo legge indietro (colori e `platform:@handle` diventano chip trascinabili). Le due direzioni
 * usano la STESSA sintassi — `platform:@handle`, `#rrggbb`/`#rgb`/`rgb(...)` — o scriverebbero e
 * leggerebbero due lingue diverse.
 */
import type { Db } from '$lib/server/db/client';
import { runBrandAnalysis, type BrandProfile } from '$lib/server/brand-analysis';
import { withOrgContext } from '$lib/server/ai-log';
import { gateOrgCredits, CreditsExhaustedError } from '$lib/server/credits';
import { insertBrandProducts } from '$lib/server/repos/products';
import { setProjectBrand } from '$lib/server/repos/projects';
import { SOCIAL_PLATFORMS } from '$lib/canvas/social-platforms';
import type { StorePlatform } from '$lib/server/store-fetch';

export type WizardHandle = { platform: string; handle: string };

export type WizardDraft = {
  target: string;
  colours: string[];
  brandHandles: WizardHandle[];
  competitorHandles: WizardHandle[];
};

export type WizardProduct = {
  externalId: string;
  handle: string | null;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  images: Array<{ url: string; alt?: string | null; position?: number }>;
  available: boolean | null;
  included: boolean;
};

function handleLines(handles: WizardHandle[]): string[] {
  return handles
    .filter((h) => (SOCIAL_PLATFORMS as readonly string[]).includes(h.platform) && h.handle.trim())
    .map((h) => `- ${h.platform}:@${h.handle.trim().replace(/^@/, '')}`);
}

/**
 * IL MARKDOWN CHE `brands.content` RICEVE — una sezione per domanda del wizard, e nessuna sezione
 * quando la risposta è vuota: un `## Colori` senza colori sotto sarebbe un titolo che non porta
 * niente, e `renderBrandContentHtml` lo mostrerebbe comunque come intestazione vuota.
 */
export function composeWizardContent(draft: WizardDraft): string {
  const parts: string[] = [];

  if (draft.target.trim()) {
    parts.push(`## Target\n\n${draft.target.trim()}`);
  }

  if (draft.colours.length) {
    parts.push(`## Colours\n\n${draft.colours.map((c) => `- ${c}`).join('\n')}`);
  }

  const brandLines = handleLines(draft.brandHandles);
  if (brandLines.length) {
    parts.push(`## Social handles\n\n${brandLines.join('\n')}`);
  }

  const competitorLines = handleLines(draft.competitorHandles);
  if (competitorLines.length) {
    parts.push(`## Competitors\n\n${competitorLines.join('\n')}`);
  }

  return parts.join('\n\n');
}

export type WizardAnalysis = {
  profile: BrandProfile;
  suggestedContent: string;
  products: WizardProduct[];
};

/**
 * IL PASSO "SITO" — legge il sito UNA VOLTA, e ne cava tutto quel che i passi dopo mostrano già
 * compilato: descrizione, colori, prodotti rilevati, una bozza di target. `gateOrgCredits` PRIMA
 * di spendere: l'org non ha ancora un brand a questo punto del wizard (il brand nasce solo
 * all'approvazione), quindi paga lei — `withOrgContext` è lo stesso scope che `media-generate.ts`
 * usa per una generazione senza brand.
 */
export async function analyzeWizardSite(orgId: string, url: string): Promise<WizardAnalysis> {
  await gateOrgCredits(orgId);

  const profile = await withOrgContext(orgId, () => runBrandAnalysis(url, () => {}));

  const draft: WizardDraft = {
    target: profile.target_audience ?? '',
    colours: profile.brand_colors ?? [],
    brandHandles: (profile.social_handles ?? []).map((h) => ({ platform: h.platform, handle: h.handle })),
    competitorHandles: []
  };

  const products: WizardProduct[] = (profile.products ?? []).map((p, i) => ({
    externalId: `site-${i}`,
    handle: null,
    title: p.name,
    description: p.description ?? null,
    price: null,
    currency: null,
    url: null,
    images: (p.images ?? []).map((imgUrl, position) => ({ url: imgUrl, position })),
    available: true,
    included: true
  }));

  return { profile, suggestedContent: composeWizardContent(draft), products };
}

export { CreditsExhaustedError };

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'brand';
}

/**
 * UNO SLUG CHE NON COLLIDE — `unique (org_id, slug)` (`NEW_DATABASE_STRUCTURE.md`). Non una
 * query "esiste già?" seguita da un insert che può ancora perdere la corsa: si prova, e se il
 * database rifiuta per lo slug si ritenta con un suffisso — la stessa forma di ogni retry onesto
 * su un vincolo unico, mai un check-then-act.
 */
export async function createBrandFromWizard(
  db: Db,
  input: {
    orgId: string;
    projectId: string;
    projectHasBrand: boolean;
    name: string;
    website: string | null;
    shortDescription: string | null;
    content: string;
    logoUrl: string | null;
    products: WizardProduct[];
    productsPlatform: StorePlatform | null;
  }
): Promise<{ id: string; slug: string }> {
  const base = slugify(input.name);
  let brandId: string | null = null;
  let slug = base;

  for (let attempt = 0; attempt < 5 && !brandId; attempt++) {
    slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await db
      .from('brands')
      .insert({
        org_id: input.orgId,
        name: input.name,
        slug,
        website: input.website,
        short_description: input.shortDescription,
        content: input.content,
        logo_url: input.logoUrl
      })
      .select('id, slug')
      .single();

    if (!error && data) {
      brandId = data.id;
      break;
    }
    if (error && !error.message.includes('brands_org_id_slug_key') && !/duplicate|unique/i.test(error.message)) {
      throw error;
    }
  }

  if (!brandId) {
    throw new Error('Could not create the brand: slug kept colliding');
  }

  const included = input.products.filter((p) => p.included);
  if (included.length && input.productsPlatform) {
    await insertBrandProducts(db, {
      orgId: input.orgId,
      brandId,
      platform: input.productsPlatform,
      products: included.map((p) => ({
        externalId: p.externalId,
        handle: p.handle,
        title: p.title,
        description: p.description,
        price: p.price,
        currency: p.currency,
        url: p.url,
        images: p.images,
        available: p.available
      }))
    });
  }

  if (!input.projectHasBrand) {
    await setProjectBrand(db, { orgId: input.orgId, projectId: input.projectId, brandId });
  }

  return { id: brandId, slug };
}
