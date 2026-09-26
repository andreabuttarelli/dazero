/**
 * QUALI CAMPI UN NODO CHE GENERA MOSTRA, E COME LEGGERLI DA `nodes.data` — una tabella sola,
 * `GEN_FIELDS`, letta sia con UN nodo selezionato (la barra prende il suo valore com'è) sia con
 * PIÙ nodi (`commonPropertiesOf` confronta gli stessi valori fra loro). Prima del bar unico
 * c'erano due letture dello stesso dato — l'overlay di `GenNode.svelte` e questo pannello — che
 * potevano solo divergere alla prima riga aggiunta; un solo elenco è la riga sola.
 *
 * "MIXED" È UN VALORE, NON UN'ASSENZA. Due nodi con `model` diverso non hanno "nessun modello": ne
 * hanno due, e mostrarlo come vuoto inviterebbe a scriverne uno che poi si applica sopra entrambi
 * senza che l'utente sappia di aver cambiato qualcosa che prima non era uguale. `Mixed` distingue
 * "non lo so" (il campo non esiste su un tipo misto, o su un tipo che non lo prevede) da "so che
 * sono diversi". Con un nodo solo, `Mixed` non compare mai: `commonOf` su un array di un elemento
 * è sempre `same`.
 *
 * PURO: nessun database, nessun `$state`. Chi disegna la barra legge questo file per sapere COSA
 * mostrare; la scrittura resta di chi ha i nodi in mano (la pagina), con la concorrenza ottimistica
 * di sempre — questo file non sa cosa sia una `version`.
 */

export type GenFieldId = 'model' | 'aspectRatio' | 'duration' | 'resolution' | 'audio' | 'enhancePrompt' | 'repeat';

export type CommonValue<T> = { kind: 'same'; value: T } | { kind: 'mixed' } | { kind: 'unset' } | { kind: 'absent' };

type NodeSummary = { type: string; data: Record<string, unknown> };

export type GenField = {
  id: GenFieldId;
  /** Il tipo di nodo mostra questo campo? Il testo non ha formato, durata o audio. */
  appliesTo: (type: string) => boolean;
  /** Il valore di questo campo su un nodo, o `undefined` se il tipo non lo applica o il dato manca. */
  read: (node: NodeSummary) => unknown;
};

function paramOf(node: NodeSummary, key: string): unknown {
  return (node.data.params as Record<string, unknown> | undefined)?.[key];
}

const NOT_TEXT = (type: string) => type === 'image' || type === 'video';

export const GEN_FIELDS: readonly GenField[] = [
  {
    id: 'model',
    appliesTo: () => true,
    read: (n) => (typeof n.data.model === 'string' ? n.data.model : null)
  },
  {
    id: 'aspectRatio',
    appliesTo: NOT_TEXT,
    read: (n) => paramOf(n, 'aspectRatio')
  },
  {
    id: 'duration',
    appliesTo: NOT_TEXT,
    read: (n) => paramOf(n, 'duration')
  },
  {
    id: 'resolution',
    appliesTo: NOT_TEXT,
    read: (n) => paramOf(n, 'resolution')
  },
  {
    id: 'audio',
    appliesTo: NOT_TEXT,
    read: (n) => paramOf(n, 'audio')
  },
  {
    id: 'enhancePrompt',
    appliesTo: NOT_TEXT,
    read: (n) => paramOf(n, 'enhancePrompt')
  },
  {
    id: 'repeat',
    appliesTo: () => true,
    read: (n) => paramOf(n, 'repeat')
  }
];

export type CommonProperties = {
  /** Solo quando OGNI nodo selezionato è dello stesso `type` gen (text/image/video). */
  type: 'text' | 'image' | 'video' | null;
  model: CommonValue<string | null>;
  aspectRatio: CommonValue<string>;
  duration: CommonValue<number>;
  resolution: CommonValue<string>;
  audio: CommonValue<boolean>;
  enhancePrompt: CommonValue<boolean>;
  repeat: CommonValue<number>;
};

const GEN_TYPES = new Set(['text', 'image', 'video']);

function commonOf<T>(values: T[]): CommonValue<T> {
  const [first, ...rest] = values;
  if (first === undefined) return { kind: 'absent' };
  return rest.every((v) => v === first) ? { kind: 'same', value: first } : { kind: 'mixed' };
}

function commonFieldOf<T>(field: GenField, type: string, nodes: NodeSummary[]): CommonValue<T> {
  if (!field.appliesTo(type)) return { kind: 'absent' };
  const values = nodes.map((n) => field.read(n)).filter((v): v is T => v !== undefined);
  return values.length ? commonOf(values) : { kind: 'unset' };
}

/**
 * LO STESSO same/mixed/unset DI `GEN_FIELDS`, PER I CAMPI CHE IL MODELLO SCELTO DICHIARA
 * (`ai_models.param_schema` → `ModelChoice.params`, `model-params.ts`) — quelli che nessuna riga
 * di `GEN_FIELDS` conosce per nome, perché sono diversi per modello (`quality` su GPT Image,
 * `output_compression` altrove). Legge `nodes.data.params.<name>`, lo stesso posto di
 * `paramOf` sopra: un solo posto scrive quei valori (`onpropertychange`), uno solo li legge qui e
 * nel toolbar.
 */
export function dynamicParamsOf(nodes: NodeSummary[], paramNames: string[]): Record<string, CommonValue<unknown>> {
  const out: Record<string, CommonValue<unknown>> = {};

  for (const name of paramNames) {
    const values = nodes.map((n) => paramOf(n, name)).filter((v) => v !== undefined);
    out[name] = values.length ? commonOf(values) : { kind: 'unset' };
  }

  return out;
}

export function commonPropertiesOf(nodes: NodeSummary[]): CommonProperties {
  const empty: CommonProperties = {
    type: null,
    model: { kind: 'absent' },
    aspectRatio: { kind: 'absent' },
    duration: { kind: 'absent' },
    resolution: { kind: 'absent' },
    audio: { kind: 'absent' },
    enhancePrompt: { kind: 'absent' },
    repeat: { kind: 'absent' }
  };

  if (!nodes.length || !nodes.every((n) => GEN_TYPES.has(n.type))) return empty;

  const sameType = commonOf(nodes.map((n) => n.type));
  if (sameType.kind !== 'same') return empty;
  const type = sameType.value as 'text' | 'image' | 'video';

  const byId = Object.fromEntries(GEN_FIELDS.map((f) => [f.id, f])) as Record<GenFieldId, GenField>;

  return {
    type,
    model: commonFieldOf(byId.model, type, nodes),
    aspectRatio: commonFieldOf(byId.aspectRatio, type, nodes),
    duration: commonFieldOf(byId.duration, type, nodes),
    resolution: commonFieldOf(byId.resolution, type, nodes),
    audio: commonFieldOf(byId.audio, type, nodes),
    enhancePrompt: commonFieldOf(byId.enhancePrompt, type, nodes),
    repeat: commonFieldOf(byId.repeat, type, nodes)
  };
}
