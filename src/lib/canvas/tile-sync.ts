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
type WithPosition = WithId & { position: unknown };

export function syncNodes<N extends WithId, T extends WithId>(
  current: N[],
  tiles: T[],
  toNode: (tile: T) => N
): N[] | null {
  const tileById = new Map(tiles.map((t) => [t.id, t]));
  const known = new Set(current.map((n) => n.id));

  // I nodi che restano tengono la POSIZIONE com'era — quella sola: è ciò che SvelteFlow sta
  // muovendo, e riportarla indietro dalla tile butterebbe via un trascinamento in corso. Il resto
  // (`data`, comprese le porte che il modello scelto apre) si rifà dalla tile ad ogni giro, o un
  // cambio di modello non aggiornerebbe mai un nodo già sulla tela.
  const kept: N[] = [];
  let dataChanged = false;
  for (const n of current) {
    const t = tileById.get(n.id);
    if (!t) continue;
    const fresh = toNode(t);
    const hasPosition = 'position' in (n as object);
    kept.push(hasPosition ? { ...fresh, position: (n as unknown as WithPosition).position } : fresh);
    if (JSON.stringify((fresh as { data?: unknown }).data) !== JSON.stringify((n as { data?: unknown }).data)) {
      dataChanged = true;
    }
  }
  const added = tiles.filter((t) => !known.has(t.id)).map(toNode);

  if (!added.length && !dataChanged && kept.length === current.length) return null;

  return [...kept, ...added];
}
