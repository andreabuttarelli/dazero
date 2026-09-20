import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listBrandMedia } from '$lib/server/brand-media';
import { ensureBrandCanvas, saveCanvasPositions } from '$lib/server/canvas';

/**
 * LA TELA DEL BRAND: media, documenti e post, con le posizioni che restano dove le lasci.
 *
 * Le posizioni vivono in `brand_canvas_items`, una riga per tile. Chi apre la tela la prima volta
 * non ne ha nessuna: il layout iniziale lo calcola il client con `packTiles`, e da lì in poi
 * comanda quello che è stato salvato.
 */
export const load: PageServerLoad = async ({ parent, locals: { supabase } }) => {
  const { brand } = await parent();

  const [media, documents, posts, canvas] = await Promise.all([
    listBrandMedia(supabase, brand.id, { limit: 18 }),
    supabase
      .from('brand_documents')
      .select('id, title, kind, status, summary, file_name, collection, created_at')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(18),
    supabase
      .from('posts')
      .select('id, caption, media_url, platform, status, content_type, scheduled_for')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(18),
    ensureBrandCanvas(supabase, brand.id)
  ]);

  return {
    items: media,
    documents: documents.data ?? [],
    posts: posts.data ?? [],
    canvasId: canvas?.id ?? null,
    placements: canvas?.placements ?? {}
  };
};

export const actions: Actions = {
  /**
   * Dove una tile è finita. Arriva una tile alla volta — è un trascinamento, non un salvataggio di
   * massa — e la riga si crea al primo spostamento invece che all'apertura: una tela guardata e
   * mai toccata non deve lasciare quaranta righe dietro di sé.
   */
  move: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const { data: brand } = await supabase.from('brands').select('id').eq('slug', params.brand).maybeSingle();
    if (!brand) return fail(404, { error: 'brand_not_found' });

    const fd = await request.formData();
    const saved = await saveCanvasPositions(supabase, {
      brandId: brand.id,
      userId: user.id,
      canvasId: String(fd.get('canvas_id') ?? ''),
      refKind: String(fd.get('ref_kind') ?? ''),
      refId: String(fd.get('ref_id') ?? ''),
      x: Number(fd.get('x')),
      y: Number(fd.get('y')),
      w: Number(fd.get('w')),
      h: Number(fd.get('h'))
    });

    return saved.ok ? { saved: true } : fail(400, { error: saved.error });
  }
};
