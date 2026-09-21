/**
 * DOVE NASCE UN NODO CHIESTO COL DOPPIO CLIC.
 *
 * Centrato sul punto, perché è lì che si sta guardando: appoggiarlo con l'angolo sul puntatore lo
 * farebbe comparire in basso a destra rispetto al gesto, e su una tela che si può scorrere basta
 * quello per perderlo di vista.
 *
 * Il punto arriva GIÀ in unità di tela. Convertire qui le coordinate dello schermo vorrebbe dire
 * conoscere zoom e traslazione, che sono della vista — e questo modulo non ne sa niente, come
 * `layout.ts` accanto.
 */
import { genNodeSize, type GenMedium } from './gen-node';

/**
 * Il tipo MIME con cui un medium viaggia dentro un trascinamento. Un tipo nostro e non
 * `text/plain`: così un testo trascinato da fuori — una selezione, un link — non si traveste da
 * richiesta di creare un nodo.
 */
export const CANVAS_DRAG_MEDIUM = 'application/x-anomalia-medium';

export type NewGenTile = {
  id: string;
  medium: GenMedium;
  x: number;
  y: number;
  w: number;
  h: number;
  prompt: string;
  model: string | null;
  params: Record<string, unknown>;
  refId: null;
  connectable: true;
};

export function newGenNodeAt(medium: GenMedium, at: { x: number; y: number }): NewGenTile {
  const { w, h } = genNodeSize(medium);

  return {
    id: crypto.randomUUID(),
    medium,
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    prompt: '',
    // Il modello lo sceglie chi disegna, dal catalogo del brand: qui non c'è modo di sapere quale
    // sia il suo, e scriverne uno a caso sarebbe una scelta fatta al posto suo.
    model: null,
    params: {},
    refId: null,
    connectable: true
  };
}
