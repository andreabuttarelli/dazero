/**
 * I NODI CHE PRODUCONO, scritti.
 *
 * Due strade separate, e la separazione è il punto: `saveGenNode` scrive cosa si chiede (medium,
 * modello, prompt, parametri), `moveCanvasItem` scrive solo dove sta. Con una funzione sola un
 * trascinamento riscriverebbe anche il prompt — e due gesti che arrivano vicini, la riga appena
 * digitata e la tile appena spostata, si cancellerebbero a vicenda a seconda di chi arriva dopo.
 *
 * I CONTROLLI PRIMA DELLA SCRITTURA, come per le posizioni e gli archi: i vincoli del database
 * bocciano comunque, ma con un SQLSTATE che non dice niente a chi ha solo scritto in una casella.
 * Un `NaN` arriva davvero — è un trascinamento interrotto — e scritto darebbe una tile
 * irraggiungibile, che nessuno può più spostare perché non si vede.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { GEN_MEDIUMS, isGenMedium } from '$lib/canvas/gen-node';

export type SaveGenNode = {
  brandId: string;
  userId: string;
  canvasId: string;
  /** Null per un nodo appena nato; l'id della riga quando si sta modificando. */
  itemId: string | null;
  /**
   * L'id che il client ha già coniato per il nodo che sta disegnando.
   *
   * Serve a NON avere due id per la stessa cosa. Prima il nodo nasceva con un id provvisorio e lo
   * scambiava con quello del database appena la riga esisteva: la tela si ritrovava la copia
   * vecchia accanto a quella nuova — il fantasma che restava indietro sulla mappa. Coniandolo una
   * volta sola non c'è niente da scambiare.
   */
  newId?: string | null;
  medium: string;
  prompt: string;
  model: string | null;
  /** I parametri arrivano come testo dal form: qui si verifica che siano JSON prima di scriverli. */
  params: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function finite(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}

/**
 * Un id coniato dal client è comunque roba che arriva da fuori: un valore che non è un UUID lo
 * rifiuta Postgres con un `invalid input syntax for type uuid`, che a chi ha solo aggiunto un
 * riquadro non dice niente.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveGenNode(
  supabase: SupabaseClient,
  input: SaveGenNode
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isGenMedium(input.medium)) {
    return { ok: false, error: `medium non ammesso: ${input.medium}. Sono ${GEN_MEDIUMS.join(', ')}.` };
  }
  if (!input.canvasId) {
    return { ok: false, error: 'canvas_id è obbligatorio' };
  }
  if (!finite(input.x, input.y, input.w, input.h) || input.w <= 0 || input.h <= 0) {
    return { ok: false, error: 'posizione e misura devono essere numeri, con larghezza e altezza positive' };
  }

  if (input.newId && !UUID.test(input.newId)) {
    return { ok: false, error: `id non valido: ${input.newId}` };
  }

  let params: unknown;
  try {
    params = JSON.parse(input.params || '{}');
  } catch {
    return { ok: false, error: 'params non è JSON' };
  }

  const values = {
    medium: input.medium,
    model: input.model,
    prompt: input.prompt,
    params,
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h
  };

  if (input.itemId) {
    // Il filtro sul brand accanto a quello sull'id: l'id da solo viene da chi manda la richiesta,
    // e le RLS lo fermerebbero comunque — ma un rifiuto che nomina la riga è meglio di uno che
    // dice zero righe aggiornate.
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
      // Assente quando il client non ne ha coniato uno: lì decide il default della colonna, non
      // un id inventato qui.
      ...(input.newId ? { id: input.newId } : {}),
      canvas_id: input.canvasId,
      brand_id: input.brandId,
      ref_kind: 'gen',
      // Null finché il nodo non ha prodotto: è lo stato normale di questo tipo, non una riga a metà.
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

/** Dove una tile è finita, e nient'altro. */
export async function moveCanvasItem(
  supabase: SupabaseClient,
  input: { brandId: string; itemId: string; x: number; y: number }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.itemId) {
    return { ok: false, error: 'item_id è obbligatorio' };
  }
  if (!finite(input.x, input.y)) {
    return { ok: false, error: 'x e y devono essere numeri' };
  }

  const { error } = await supabase
    .from('brand_canvas_items')
    .update({ x: input.x, y: input.y })
    .eq('id', input.itemId)
    .eq('brand_id', input.brandId);

  return error ? { ok: false, error: error.message } : { ok: true };
}
