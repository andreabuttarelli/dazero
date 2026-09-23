/**
 * COSA HANNO IN COMUNE PIÙ NODI SELEZIONATI — model e aspect ratio, gli unici due campi che TUTTI
 * i tipi che generano condividono (`gen-node.ts::GenParams`). Un tipo misto (un testo e
 * un'immagine insieme) non condivide niente di questo: il pannello resta vuoto, non a metà.
 *
 * PURO: nessun database, nessun `$state`. Il pannello (`CommonPropertiesPanel.svelte`) legge
 * questo file per sapere COSA disegnare; la scrittura resta di chi ha i nodi in mano (la pagina),
 * con la concorrenza ottimistica di sempre — questo file non sa cosa sia una `version`.
 *
 * "MIXED" È UN VALORE, NON UN'ASSENZA. Due nodi con `model` diverso non hanno "nessun modello": ne
 * hanno due, e mostrarlo come vuoto inviterebbe a scriverne uno che poi si applica sopra entrambi
 * senza che l'utente sappia di aver cambiato qualcosa che prima non era uguale. `Mixed` distingue
 * "non lo so" (il campo non esiste su un tipo misto) da "so che sono diversi".
 */

export type CommonValue<T> = { kind: 'same'; value: T } | { kind: 'mixed' } | { kind: 'absent' };

export type CommonProperties = {
  /** Solo quando OGNI nodo selezionato è dello stesso `type` gen (text/image/video). */
  type: 'text' | 'image' | 'video' | null;
  model: CommonValue<string | null>;
  aspectRatio: CommonValue<string>;
};

const GEN_TYPES = new Set(['text', 'image', 'video']);

function commonOf<T>(values: T[]): CommonValue<T> {
  const [first, ...rest] = values;
  if (first === undefined) return { kind: 'absent' };
  return rest.every((v) => v === first) ? { kind: 'same', value: first } : { kind: 'mixed' };
}

export function commonPropertiesOf(
  nodes: { type: string; data: Record<string, unknown> }[]
): CommonProperties {
  if (!nodes.length || !nodes.every((n) => GEN_TYPES.has(n.type))) {
    return { type: null, model: { kind: 'absent' }, aspectRatio: { kind: 'absent' } };
  }

  const sameType = commonOf(nodes.map((n) => n.type));
  const type = sameType.kind === 'same' ? (sameType.value as 'text' | 'image' | 'video') : null;

  const models = nodes.map((n) => (typeof n.data.model === 'string' ? n.data.model : null));
  const aspectRatios = nodes
    .map((n) => (n.data.params as Record<string, unknown> | undefined)?.aspectRatio)
    .filter((v): v is string => typeof v === 'string');

  return {
    type,
    model: type ? commonOf(models) : { kind: 'absent' },
    aspectRatio: type && type !== 'text' ? commonOf(aspectRatios) : { kind: 'absent' }
  };
}
