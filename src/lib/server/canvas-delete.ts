/**
 * TOGLIERE UNA TILE DALLA TELA.
 *
 * File suo e non una funzione in più accanto a `saveGenNode`: cancellare è l'unica operazione
 * della tela che non si disfa da sola riprovando, e tenerla separata rende visibile chi la chiama.
 *
 * UNA CHIAMATA PER PIÙ TILE, al contrario di `saveGenNode` che ne scrive una alla volta. Lì la
 * regola è che un gesto dell'utente tocca una cosa; qui il gesto è «cancella la selezione», e la
 * selezione è plurale per natura. Un giro per ogni id darebbe cancellazioni a metà — le prime
 * sparite, le ultime no — che è lo stato peggiore in cui lasciare una tela.
 *
 * `brand_id` NEL FILTRO, sempre. Gli id delle tile sono UUID coniati dal client, quindi arrivano
 * dall'esterno: senza quel filtro una cancellazione con l'id giusto raggiunge la tela di un altro
 * brand. Il test guarda la catena, non solo il risultato — un risultato `ok` non sa dire quali
 * righe sono sparite.
 *
 * GLI ARCHI NON SI CANCELLANO QUI: `brand_canvas_edges` li porta via da sé con la chiave esterna
 * sulle tile. Rifarlo a mano vorrebbe dire due regole per la stessa cosa, e quella scritta qui
 * resterebbe indietro al primo cambio di schema.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type DeleteCanvasItems = {
  brandId: string;
  itemIds: string[];
};

export type DeleteResult = { ok: true; deleted: number } | { ok: false; error: string };

export async function deleteCanvasItems(
  supabase: SupabaseClient,
  input: DeleteCanvasItems
): Promise<DeleteResult> {
  if (!input.brandId) {
    return { ok: false, error: 'brand_id è obbligatorio' };
  }

  const ids = [...new Set(input.itemIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    return { ok: false, error: 'serve almeno una tile da togliere' };
  }

  const { error } = await supabase
    .from('brand_canvas_items')
    .delete()
    .in('id', ids)
    .eq('brand_id', input.brandId);

  return error ? { ok: false, error: error.message } : { ok: true, deleted: ids.length };
}
