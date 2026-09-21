/**
 * LE PAGINE INCORPORATE, SCRITTE.
 *
 * Accanto a `canvas-gen.ts` e con la stessa divisione: qui si scrive COSA mostra la tile, mentre
 * dove sta la sposta `moveCanvasItem`, che va bene per ogni tipo. Con una funzione sola un
 * trascinamento riscriverebbe anche l'indirizzo.
 *
 * I CONTROLLI PRIMA DELLA SCRITTURA, e qui più che altrove, perché uno di loro è una difesa.
 * `brand_canvas_items_iframe_url_scheme` boccia comunque `javascript:`, ma come 23514 che nomina
 * un vincolo — e chi legge quel rifiuto è spesso l'agente, che riprova con un'altra invenzione.
 * Dire «solo http e https» chiude il giro al primo tentativo.
 *
 * PERCHÉ NON C'È `assertPublicUrl` QUI, che è la domanda che vale la pena porsi.
 *
 * Quel guardiano esiste contro l'SSRF: il SERVER che va a prendere un indirizzo scelto da uno
 * sconosciuto, e finisce sui metadati del cloud o dentro la rete privata. Qui il server non
 * fetcha niente — scrive una stringa e la rimanda al browser, che la carica con la rete di CHI
 * GUARDA. Un `http://192.168.1.1/` incorporato non raggiunge la nostra infrastruttura: al massimo
 * il router di casa di chi apre la tela, che il suo browser può già aprire scrivendolo nella barra.
 *
 * Resta una cosa che il guardiano NON coprirebbe comunque e che la sandbox copre: l'iframe è su
 * un'origine opaca, quindi anche se quella pagina si caricasse, chi l'ha incorporata non può
 * leggerne il contenuto — nessuna esfiltrazione verso chi ha scritto la tile.
 *
 * E c'è una ragione per NON metterlo: `assertPublicUrl` risolve il DNS a ogni salvataggio. Su un
 * campo che si salva mentre si scrive sarebbe una risoluzione per battuta, e soprattutto
 * renderebbe non salvabile un indirizzo interno legittimo — una dashboard sulla rete aziendale di
 * chi usa il prodotto è esattamente il genere di cosa che uno incorpora nella propria tela.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmbedUrl } from '$lib/canvas/iframe-node';

export type SaveIframeNode = {
  brandId: string;
  userId: string;
  canvasId: string;
  /** Null per una tile appena nata; l'id della riga quando si sta modificando. */
  itemId: string | null;
  /**
   * L'id che il client ha già coniato per la tile che sta disegnando, come per i nodi che
   * producono. Serve a NON avere due id per la stessa cosa: con un id provvisorio scambiato dopo,
   * la tela si ritrova la copia vecchia accanto a quella nuova.
   */
  newId?: string | null;
  url: string;
  html: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function finite(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}

export async function saveIframeNode(
  supabase: SupabaseClient,
  input: SaveIframeNode
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!input.canvasId) {
    return { ok: false, error: 'canvas_id è obbligatorio' };
  }
  if (!finite(input.x, input.y, input.w, input.h) || input.w <= 0 || input.h <= 0) {
    return { ok: false, error: 'posizione e misura devono essere numeri, con larghezza e altezza positive' };
  }

  const url = input.url.trim();
  const html = input.html.trim();

  // Uno e uno solo, la stessa domanda di `brand_canvas_items_iframe_source`. Entrambi pieni non è
  // una scelta da fare al posto di chi scrive: è una riga che non si sa disegnare.
  if (url && html) {
    return { ok: false, error: 'una pagina incorporata porta un indirizzo OPPURE del codice, non tutti e due' };
  }
  if (!url && !html) {
    return { ok: false, error: 'serve un indirizzo o del codice da mostrare' };
  }

  // L'indirizzo si normalizza prima di scriverlo: `example.com` diventa `https://example.com/`,
  // che è ciò che il check in migrazione ammette. Senza, una riga legittima verrebbe bocciata.
  let normalized: string | null = null;
  if (url) {
    const verdict = normalizeEmbedUrl(url);
    if (!verdict.ok) return { ok: false, error: verdict.why };
    normalized = verdict.url;
  }

  const values = {
    url: normalized,
    html: html || null,
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h
  };

  if (input.itemId) {
    // Il filtro sul brand accanto a quello sull'id: l'id viene da chi manda la richiesta, e le RLS
    // lo fermerebbero comunque — ma un rifiuto che nomina la riga è meglio di zero righe toccate.
    const { error } = await supabase
      .from('brand_canvas_items')
      .update(values)
      .eq('id', input.itemId)
      .eq('brand_id', input.brandId);

    return error ? { ok: false, error: error.message } : { ok: true, id: input.itemId };
  }

  const { data, error } = await supabase
    .from('brand_canvas_items')
    .insert({
      ...(input.newId ? { id: input.newId } : {}),
      canvas_id: input.canvasId,
      brand_id: input.brandId,
      ref_kind: 'iframe',
      // Null SEMPRE, e non «finché non ha prodotto» come per `gen`: non c'è nessuna riga di
      // nessuna tabella a cui questa tile possa puntare.
      ref_id: null,
      created_by: input.userId,
      ...values
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  const id = (data as { id?: string } | null)?.id;
  return id ? { ok: true, id } : { ok: false, error: 'riga non creata' };
}
