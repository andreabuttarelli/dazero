/**
 * TOGLIERE UNA LINEA E CAMBIARLE VERSO.
 *
 * `saveCanvasEdge` sa solo aggiungere, e per un po' è bastato: una tela su cui si può solo
 * disegnare è una tela su cui il primo errore resta per sempre. Chi tira una linea nel posto
 * sbagliato — o la tira giusta e col verso sbagliato, che è il caso frequente perché il verso di
 * default lo sceglie il gesto e non la persona — deve poterla correggere senza andare in database.
 *
 * DUE FUNZIONI E NON UNA CON UN INTERRUTTORE: cancellare e riscrivere sono due intenzioni, e un
 * parametro `mode` le farebbe convivere in un corpo con un `if` in mezzo — che è due funzioni
 * scritte peggio. Sono qui accanto perché toccano la stessa riga, non perché siano la stessa cosa.
 *
 * IL FILTRO SUL BRAND NON È RIDONDANTE CON LE RLS. Le policy dicono cosa il client PUÒ toccare;
 * questo dice cosa si INTENDE toccare. Senza, un id di un'altra tela passerebbe come intenzione
 * valida e tornerebbe un successo silenzioso su zero righe — il modo peggiore di dire «non è
 * successo niente».
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CANVAS_EDGE_KINDS, type CanvasEdgeKind } from '$lib/canvas-edges';

export type EdgeOp = {
  brandId: string;
  edgeId: string;
};

export type OpResult = { ok: true } | { ok: false; error: string };

export async function deleteCanvasEdge(
  supabase: SupabaseClient,
  input: EdgeOp
): Promise<OpResult> {
  if (!input.edgeId || !input.brandId) {
    return { ok: false, error: 'id e brand_id sono obbligatori' };
  }

  const { error } = await supabase
    .from('brand_canvas_edges')
    .delete()
    .eq('id', input.edgeId)
    .eq('brand_id', input.brandId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function retypeCanvasEdge(
  supabase: SupabaseClient,
  input: EdgeOp & { kind: string }
): Promise<OpResult> {
  if (!CANVAS_EDGE_KINDS.includes(input.kind as CanvasEdgeKind)) {
    return {
      ok: false,
      error: `kind non ammesso: ${input.kind}. Sono ${CANVAS_EDGE_KINDS.join(', ')}.`
    };
  }
  if (!input.edgeId || !input.brandId) {
    return { ok: false, error: 'id e brand_id sono obbligatori' };
  }

  const { error } = await supabase
    .from('brand_canvas_edges')
    .update({ kind: input.kind })
    .eq('id', input.edgeId)
    .eq('brand_id', input.brandId);

  return error ? { ok: false, error: error.message } : { ok: true };
}
