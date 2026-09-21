/**
 * TENERE I NODI DI SVELTEFLOW ALLINEATI ALLE TILE, senza buttare via il trascinamento in corso.
 *
 * La libreria tiene il PROPRIO stato dei nodi, quindi la posizione vive in due posti e vanno
 * riconciliati a mano. Rigenerare tutto a ogni cambio è la via semplice e sbagliata: il nodo che
 * l'utente sta muovendo verrebbe ricostruito sotto le dita, e il trascinamento salterebbe.
 *
 * IL DIFETTO CHE QUESTO FILE ESISTE PER CHIUDERE: la riconciliazione aggiungeva e basta. Un nodo
 * appena creato nasce con un id provvisorio e lo scambia con quello del database appena la riga
 * esiste — e senza rimozione il vecchio restava sulla tela e nella minimappa, un fantasma nella
 * posizione di prima che nessuno aggiornava più.
 *
 * `null` QUANDO NON C'È NIENTE DA FARE, invece di un array nuovo uguale al precedente: restituirlo
 * comunque farebbe ridisegnare la tela a ogni battito dell'effetto.
 */

type WithId = { id: string };

export function syncNodes<N extends WithId, T extends WithId>(
  current: N[],
  tiles: T[],
  toNode: (tile: T) => N
): N[] | null {
  const wanted = new Set(tiles.map((t) => t.id));
  const known = new Set(current.map((n) => n.id));

  // I nodi che restano li si PORTA AVANTI com'erano: sono quelli che SvelteFlow sta muovendo, e
  // ricostruirli dalla tile riporterebbe indietro la posizione che l'utente sta cambiando.
  const kept = current.filter((n) => wanted.has(n.id));
  const added = tiles.filter((t) => !known.has(t.id)).map(toNode);

  if (!added.length && kept.length === current.length) return null;

  return [...kept, ...added];
}
