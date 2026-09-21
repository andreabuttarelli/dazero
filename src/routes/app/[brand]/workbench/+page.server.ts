import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadHomeOverview } from '$lib/server/hub-overview';
import { cachedBrandPage } from '$lib/server/page-cache';
import { ensureBrandCanvas, loadCanvasItems, loadCanvasEdges, saveCanvasEdge } from '$lib/server/canvas';
import { saveGenNode, moveCanvasItem } from '$lib/server/canvas-gen';

/**
 * Il workbench non è più la metà bassa della Panoramica: è una pagina sua, e ora è la TELA.
 *
 * Il guadagno vero è qui: le ~30 query di `loadHomeOverview` partono quando qualcuno apre
 * davvero il workbench, non a ogni atterraggio sulla shell del brand.
 *
 * `overview` resta restituita NON attesa: il guscio si dipinge subito e la pagina mostra il
 * proprio shimmer finché il recap non arriva. La tela invece si aspetta — è poche righe, e
 * disegnare una tela vuota che poi si riempie farebbe saltare `fitView` due volte.
 */
export const load: PageServerLoad = async (event) => {
  const { parent, locals } = event;
  const { brand } = await parent();

  return cachedBrandPage(event, brand.slug, async () => {
    const canvas = await ensureBrandCanvas(locals.supabase, brand.id);
    const [items, edges] = canvas
      ? await Promise.all([
          loadCanvasItems(locals.supabase, canvas.id),
          loadCanvasEdges(locals.supabase, canvas.id)
        ])
      : [[], []];

    return {
      overview: loadHomeOverview(locals.supabase, brand),
      canvasId: canvas?.id ?? null,
      items,
      edges
    };
  });
};

async function brandOf(supabase: App.Locals['supabase'], slug: string) {
  const { data } = await supabase.from('brands').select('id').eq('slug', slug).maybeSingle();
  return data?.id as string | undefined;
}

export const actions: Actions = {
  /**
   * Un nodo che produce, creato o modificato. UNO alla volta: è un gesto dell'utente — un menù,
   * una riga di prompt riscritta — non un salvataggio di massa.
   */
  gen: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    const fd = await request.formData();
    const saved = await saveGenNode(supabase, {
      brandId,
      userId: user.id,
      canvasId: String(fd.get('canvas_id') ?? ''),
      itemId: String(fd.get('item_id') ?? '') || null,
      newId: String(fd.get('new_id') ?? '') || null,
      medium: String(fd.get('medium') ?? ''),
      prompt: String(fd.get('prompt') ?? ''),
      model: String(fd.get('model') ?? '') || null,
      params: String(fd.get('params') ?? '{}'),
      x: Number(fd.get('x')),
      y: Number(fd.get('y')),
      w: Number(fd.get('w')),
      h: Number(fd.get('h'))
    });

    return saved.ok ? { id: saved.id } : fail(400, { error: saved.error });
  },

  /**
   * Dove una tile è finita. Separata da `gen` perché un trascinamento non deve riscrivere prompt
   * e modello: due gesti diversi, due scritture diverse, e nessuna che cancelli l'altra quando
   * arrivano vicine.
   */
  move: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    const fd = await request.formData();
    const saved = await moveCanvasItem(supabase, {
      brandId,
      itemId: String(fd.get('item_id') ?? ''),
      x: Number(fd.get('x')),
      y: Number(fd.get('y'))
    });

    return saved.ok ? { saved: true } : fail(400, { error: saved.error });
  },

  /** Una linea tirata fra due tile. Il verso di default è quello che il gesto disegna. */
  connect: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    const fd = await request.formData();
    const saved = await saveCanvasEdge(supabase, {
      brandId,
      userId: user.id,
      canvasId: String(fd.get('canvas_id') ?? ''),
      sourceItemId: String(fd.get('source_item_id') ?? ''),
      targetItemId: String(fd.get('target_item_id') ?? ''),
      kind: String(fd.get('kind') ?? 'derives_from')
    });

    return saved.ok ? { saved: true } : fail(400, { error: saved.error });
  }
};
