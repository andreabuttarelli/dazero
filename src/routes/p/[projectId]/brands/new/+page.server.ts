import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listMemberships } from '$lib/server/repos/orgs';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { analyzeWizardSite, createBrandFromWizard, CreditsExhaustedError } from '$lib/server/brand-wizard';
import { isShopifySite, isWooCommerceSite, fetchShopifyProducts, fetchWooCommerceProducts } from '$lib/server/brand-analysis';
import { safeFetchUrl } from '$lib/server/tool-guard';
import type { StorePlatform } from '$lib/server/store-fetch';

/**
 * IL WIZARD DI CREAZIONE BRAND — sito → analisi → prodotti → target → concorrenti → handle del
 * brand → overview → approva. Ogni passo è client-side (`+page.svelte` porta lo stato, salvato in
 * `sessionStorage` perché un refresh non lo perda); questa pagina espone solo le TRE azioni che
 * toccano il server: leggere il sito, sincronizzare il catalogo di uno store, e creare il brand.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) {
    throw redirect(303, '/login');
  }

  const db = await locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  const memberships = await listMemberships(db, user.id);
  const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
  if (!found) {
    throw error(404, 'questo progetto non esiste, o non è tuo');
  }

  return {
    project: { id: found.project.id, name: found.project.name },
    projectHasBrand: Boolean(found.project.brandId)
  };
};

export const actions: Actions = {
  analyze: async ({ request, params, locals }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) {
      return fail(401, { error: 'Not signed in' });
    }

    const db = await locals.db();
    if (!db) {
      return fail(500, { error: 'No session client' });
    }

    const memberships = await listMemberships(db, user.id);
    const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
    if (!found) {
      return fail(404, { error: 'Project not found' });
    }

    const fd = await request.formData();
    const url = String(fd.get('url') ?? '').trim();
    if (!url) {
      return fail(400, { error: 'Website URL is required' });
    }

    try {
      const analysis = await analyzeWizardSite(found.orgId, url);
      return {
        analyzed: true,
        name: analysis.profile.name,
        shortDescription: analysis.profile.about,
        logoUrl: analysis.profile.logos?.[0]?.url ?? null,
        suggestedContent: analysis.suggestedContent,
        products: analysis.products,
        website: url
      };
    } catch (e) {
      if (e instanceof CreditsExhaustedError) {
        return fail(402, { error: 'credits_exhausted' });
      }
      return fail(400, { error: e instanceof Error ? e.message : 'Could not read this site' });
    }
  },

  /**
   * IL PASSO PRODOTTI, SEPARATO DALL'ANALISI — chi non vuole aspettare il giro LLM completo per
   * rivedere solo il catalogo può chiamarlo da solo; `analyze` lo copre comunque, quindi questa
   * azione è per quando il sito cambia DOPO che il resto del wizard è già compilato.
   */
  syncProducts: async ({ request, params, locals }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) {
      return fail(401, { error: 'Not signed in' });
    }

    const db = await locals.db();
    if (!db) {
      return fail(500, { error: 'No session client' });
    }

    const memberships = await listMemberships(db, user.id);
    const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
    if (!found) {
      return fail(404, { error: 'Project not found' });
    }

    const fd = await request.formData();
    const url = String(fd.get('url') ?? '').trim();
    if (!url) {
      return fail(400, { error: 'Website URL is required' });
    }

    try {
      const { body: html } = await safeFetchUrl(url);
      let platform: StorePlatform | null = null;
      let products: Awaited<ReturnType<typeof fetchShopifyProducts>> = [];

      if (isShopifySite(html)) {
        platform = 'shopify';
        products = await fetchShopifyProducts(url);
      } else if (isWooCommerceSite(html)) {
        platform = 'woocommerce';
        products = await fetchWooCommerceProducts(url);
      }

      return {
        synced: true,
        platform,
        products: products.map((p, i) => ({
          externalId: `sync-${i}`,
          handle: null,
          title: p.name,
          description: p.description ?? null,
          price: null,
          currency: null,
          url: null,
          images: (p.images ?? []).map((imgUrl, position) => ({ url: imgUrl, position })),
          available: true,
          included: true
        }))
      };
    } catch (e) {
      return fail(400, { error: e instanceof Error ? e.message : 'Could not read the catalog' });
    }
  },

  create: async ({ request, params, locals }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) {
      return fail(401, { error: 'Not signed in' });
    }

    const db = await locals.db();
    if (!db) {
      return fail(500, { error: 'No session client' });
    }

    const memberships = await listMemberships(db, user.id);
    const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
    if (!found) {
      return fail(404, { error: 'Project not found' });
    }

    const fd = await request.formData();
    const name = String(fd.get('name') ?? '').trim();
    if (!name) {
      return fail(400, { error: 'Name is required' });
    }

    const website = String(fd.get('website') ?? '').trim() || null;
    const shortDescription = String(fd.get('shortDescription') ?? '').trim() || null;
    const content = String(fd.get('content') ?? '');
    const logoUrl = String(fd.get('logoUrl') ?? '').trim() || null;
    const productsPlatform = (String(fd.get('productsPlatform') ?? '').trim() || null) as StorePlatform | null;

    let products: Parameters<typeof createBrandFromWizard>[1]['products'] = [];
    const productsRaw = String(fd.get('products') ?? '');
    if (productsRaw) {
      try {
        products = JSON.parse(productsRaw);
      } catch {
        return fail(400, { error: 'Malformed products payload' });
      }
    }

    try {
      const created = await createBrandFromWizard(db, {
        orgId: found.orgId,
        projectId: found.project.id,
        projectHasBrand: Boolean(found.project.brandId),
        name,
        website,
        shortDescription,
        content,
        logoUrl,
        products,
        productsPlatform
      });

      throw redirect(303, `/p/${found.project.id}/brands/${created.slug}`);
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && 'location' in e) {
        throw e;
      }
      return fail(400, { error: e instanceof Error ? e.message : 'Could not create the brand' });
    }
  }
};
