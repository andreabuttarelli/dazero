import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadHomeOverview } from '$lib/server/hub-overview';
import { cachedBrandPage } from '$lib/server/page-cache';
import { ensureBrandCanvas, loadCanvasItems, loadCanvasEdges, saveCanvasEdge } from '$lib/server/canvas';
import { deleteCanvasEdge, retypeCanvasEdge } from '$lib/server/canvas-edge-ops';
import { saveGenNode, moveCanvasItem } from '$lib/server/canvas-gen';
import { deleteCanvasItems } from '$lib/server/canvas-delete';
import { canvasModelCatalogue } from '$lib/server/canvas-catalogue';
import { saveIframeNode } from '$lib/server/canvas-iframe';
import { runGenNode } from '$lib/server/canvas-generate';
import { recordGenRun, showGenRun, loadGenRuns } from '$lib/server/canvas-run';
import { gateAiAction } from '$lib/server/cli-auth';

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

    // La storia si legge per TUTTI i nodi in un giro solo, e solo per quelli che producono: una
    // query per nodo sarebbe N+1 su una tela che per definizione ne ha molti.
    const runs = await loadGenRuns(
      locals.supabase,
      items.filter((i) => i.ref_kind === 'gen').map((i) => i.id)
    );

    return {
      overview: loadHomeOverview(locals.supabase, brand),
      canvasId: canvas?.id ?? null,
      items,
      edges,
      runs,
      // Il catalogo dei modelli si ASPETTA, a differenza del recap: senza, un nodo creato nei primi
      // istanti avrebbe il menù del modello vuoto e «Genera» spento, e nulla direbbe perché.
      catalogue: await canvasModelCatalogue()
    };
  });
};

async function brandOf(supabase: App.Locals['supabase'], slug: string) {
  const { data } = await supabase.from('brands').select('id').eq('slug', slug).maybeSingle();
  return data?.id as string | undefined;
}

/**
 * Il cancello dei crediti, lo STESSO delle rotte che spendono. Torna una `Response` perché lì
 * serve così; qui si legge solo il suo esito — riscrivere la condizione darebbe una seconda verità
 * su chi può spendere, e le due divergono alla prima eccezione.
 */
async function creditsDenied(brandId: string): Promise<boolean> {
  return !!(await gateAiAction({ id: brandId }, undefined));
}

export const actions: Actions = {
  /**
   * PREMERE GENERA. È l'unica action di questa pagina che spende crediti veri, e per questo è
   * l'unica che passa dal cancello.
   *
   * L'ORDINE DENTRO: prima il motore, poi la storia, poi quel che si vede. Registrare prima di
   * generare scriverebbe un giro che non è avvenuto; spostare `ref_id` prima di registrare
   * perderebbe la generazione precedente se la registrazione fallisse — che è il difetto per cui
   * la storia esiste.
   *
   * IL DOPPIO CLIC non si ferma qui ma nel browser, dove il nodo entra in `running` alla prima
   * pressione: un lucchetto sul server vorrebbe dire una riga di stato condivisa e una scadenza
   * per quando il browser muore a metà giro — complessità pagata oggi per un caso che il bottone
   * già copre.
   */
  run: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    if (await creditsDenied(brandId)) return fail(402, { error: 'credits_exhausted' });

    const fd = await request.formData();
    const itemId = String(fd.get('item_id') ?? '');
    const prompt = String(fd.get('prompt') ?? '');
    const model = String(fd.get('model') ?? '') || null;

    let params_: Record<string, unknown>;
    try {
      params_ = JSON.parse(String(fd.get('params') ?? '{}'));
    } catch {
      return fail(400, { error: 'params non è JSON' });
    }

    const out = await runGenNode(supabase, {
      brandId,
      userId: user.id,
      medium: String(fd.get('medium') ?? '') as never,
      prompt,
      model,
      params: params_
    });

    if (!out.ok) return fail(400, { error: out.error });

    // Un clip non ha ancora un asset: la coda lo deposita minuti dopo. Il giro è partito, e il
    // nodo lo sa — registrare adesso una riga senza `media_id` darebbe una miniatura vuota.
    if (!out.mediaId) return { jobId: out.jobId, run: null };

    const saved = await recordGenRun(supabase, {
      brandId,
      userId: user.id,
      itemId,
      mediaId: out.mediaId,
      prompt,
      model: out.model ?? model,
      params: params_
    });

    return saved.ok ? { jobId: null, run: saved.run } : fail(400, { error: saved.error });
  },

  /**
   * Tornare a una generazione di prima. Separata da `run` e non un suo parametro: una spende e
   * l'altra no, e una sola funzione con un `if` in mezzo metterebbe il cancello dei crediti sulla
   * strada di chi sta solo guardando indietro.
   */
  restore: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    const fd = await request.formData();
    const done = await showGenRun(supabase, {
      brandId,
      itemId: String(fd.get('item_id') ?? ''),
      runId: String(fd.get('run_id') ?? '')
    });

    return done.ok ? { saved: true } : fail(400, { error: done.error });
  },

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
   * Una pagina incorporata, creata o modificata. Separata da `gen` e non un suo parametro in più:
   * i due tipi non condividono nessun campo — uno ha modello, prompt e parametri, l'altro un
   * indirizzo o dell'HTML — e una funzione che li servisse entrambi sarebbe due funzioni con un
   * `if` in mezzo.
   *
   * La validazione dell'indirizzo sta in `saveIframeNode`, dove la vedono anche le altre strade
   * di scrittura, e il vincolo in migrazione la ripete per chi arrivasse senza passare di qui.
   */
  iframe: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    const fd = await request.formData();
    const saved = await saveIframeNode(supabase, {
      brandId,
      userId: user.id,
      canvasId: String(fd.get('canvas_id') ?? ''),
      itemId: String(fd.get('item_id') ?? '') || null,
      newId: String(fd.get('new_id') ?? '') || null,
      url: String(fd.get('url') ?? ''),
      html: String(fd.get('html') ?? ''),
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
  },

  /**
   * Una linea tolta. Separata da `connect` e non un suo `kind` speciale: aggiungere e togliere
   * sono due intenzioni, e un valore sentinella dentro la prima le farebbe convivere in un corpo
   * con un `if` in mezzo.
   */
  disconnect: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    const done = await deleteCanvasEdge(supabase, {
      brandId,
      edgeId: String((await request.formData()).get('edge_id') ?? '')
    });

    return done.ok ? { saved: true } : fail(400, { error: done.error });
  },

  /**
   * Il verso di una linea che c'è già. Non un secondo `connect`: quello farebbe nascere una riga
   * accanto alla prima — l'indice unico è su `(canvas, sorgente, bersaglio, kind)`, quindi un
   * verso diverso è una linea in più, non la stessa corretta.
   */
  retype: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    const fd = await request.formData();
    const done = await retypeCanvasEdge(supabase, {
      brandId,
      edgeId: String(fd.get('edge_id') ?? ''),
      kind: String(fd.get('kind') ?? '')
    });

    return done.ok ? { saved: true } : fail(400, { error: done.error });
  },

  /**
   * Le tile tolte dalla tela. PLURALE, al contrario di `gen` e `move`: il gesto è «cancella la
   * selezione», e la selezione è plurale per natura — un giro per ogni id lascerebbe cancellazioni
   * a metà, che è lo stato peggiore in cui abbandonare una tela.
   */
  remove: async ({ request, params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) return fail(401, { error: 'not_authenticated' });

    const brandId = await brandOf(supabase, params.brand);
    if (!brandId) return fail(404, { error: 'brand_not_found' });

    const fd = await request.formData();
    const removed = await deleteCanvasItems(supabase, {
      brandId,
      itemIds: String(fd.get('item_ids') ?? '').split(',')
    });

    return removed.ok ? { deleted: removed.deleted } : fail(400, { error: removed.error });
  }
};
