/**
 * COSA CADE QUANDO SI CANCELLA UNA SELEZIONE.
 *
 * Il gesto è uno — ⌫ su quel che è selezionato — ma quello che deve sparire è su due tabelle, e
 * una delle due il server la svuota da sé: `brand_canvas_edges` ha `on delete cascade` sulle tile.
 * Il database quindi è a posto; lo STATO DEL CLIENT no, e senza questa lista un arco resterebbe
 * disegnato verso un nodo che non esiste più, fino al ricarico della pagina.
 *
 * IL RECAP NON È UNA RIGA. È l'unica tile della tela senza `brand_canvas_items` dietro: mandarne
 * l'id al server è una cancellazione che fallisce su un gesto che chi la fa legge come innocuo.
 * L'eccezione arriva da fuori — `undeletable` — invece di essere un `if (id === 'recap')` scritto
 * qui: questo modulo non sa cosa la tela stia mostrando, e la seconda tile di arredo si aggiunge
 * a quella lista senza toccare questa regola.
 *
 * `empty` E NON UN CONTROLLO SULLA LUNGHEZZA DA PARTE DI CHI CHIAMA: dopo il filtro può non
 * restare niente da cancellare — è il caso del recap selezionato da solo — e chi chiama non deve
 * ricordarsi di ricontrollare prima di parlare col server.
 */

type Edge = { id: string; source: string; target: string };

export type DeletePlanInput = {
  /** Gli id selezionati, come SvelteFlow li conosce. */
  ids: string[];
  /** Le linee attualmente disegnate. */
  edges: Edge[];
  /** Le tile che non hanno una riga dietro, quindi non si cancellano. */
  undeletable: string[];
};

export type DeletePlan = {
  itemIds: string[];
  edgeIds: string[];
  empty: boolean;
};

export function planDelete(input: DeletePlanInput): DeletePlan {
  const spared = new Set(input.undeletable);
  const itemIds = input.ids.filter((id) => !spared.has(id));
  const falling = new Set(itemIds);

  const edgeIds = input.edges
    .filter((e) => falling.has(e.source) || falling.has(e.target))
    .map((e) => e.id);

  return { itemIds, edgeIds, empty: itemIds.length === 0 };
}
