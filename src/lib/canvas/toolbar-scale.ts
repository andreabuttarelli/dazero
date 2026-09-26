/**
 * QUANTO RIMPICCIOLIRE LA BARRA DELLA SELEZIONE QUANDO SI ZOOMA FUORI.
 *
 * Il difetto da cui nasce questo file: `SelectionToolbar` vive FUORI da `SvelteFlow`
 * (`CanvasFlow.svelte`), ancorata con coordinate di schermo (`position: fixed`) che
 * `CanvasSelectionBridge` proietta da `getNodesBounds`. Non essendo dentro il
 * `.svelte-flow__viewport`, non riceve la `transform: scale()` che la libreria applica lì — a
 * differenza della targhetta del nodo e dei nomi delle porte (`CanvasTile.svelte`), che VIVONO
 * dentro quel riquadro e si rimpiccioliscono da soli. La barra restava a grandezza fissa mentre i
 * nodi si rimpicciolivano, e a zoom basso li copriva.
 *
 * La cura: leggere lo zoom della tela (`useViewport`) e applicare la stessa riduzione con un
 * secondo `transform: scale()` sulla barra, ancorato allo stesso punto (`transform-origin`) a cui
 * è già ancorata via `translate`.
 */

export const TOOLBAR_MAX_SCALE = 1;

/**
 * Sotto questo fattore i comandi diventano difficili da colpire col mouse prima ancora che i
 * nodi diventino illeggibili: la barra smette di seguire lo zoom e resta a questa grandezza.
 */
export const TOOLBAR_MIN_SCALE = 0.5;

/**
 * Sotto questo zoom di tela i nodi stessi sono già illeggibili (etichette e porte spariscono in
 * pochi pixel): la barra si nasconde del tutto invece di restare un riquadro vuoto di senso
 * ancorato a nodi che nessuno legge più. Più basso di `TOOLBAR_MIN_SCALE` perché il clamp deve
 * intervenire per primo — la barra resta leggibile finché i nodi lo sono, sparisce solo oltre.
 */
export const TOOLBAR_HIDE_BELOW_ZOOM = 0.2;

/**
 * Il fattore di scala della barra per un dato zoom di tela.
 *
 * Segue lo zoom 1:1 nella fascia leggibile, clampato a `[TOOLBAR_MIN_SCALE, TOOLBAR_MAX_SCALE]`.
 * Uno zoom assente o assurdo vale la scala piena invece di propagarsi come `NaN` in una
 * `transform`, che farebbe sparire la barra senza che nessuno riceva un errore.
 */
export function toolbarScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return TOOLBAR_MAX_SCALE;

  return Math.min(TOOLBAR_MAX_SCALE, Math.max(TOOLBAR_MIN_SCALE, zoom));
}
