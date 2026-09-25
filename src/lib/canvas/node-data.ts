/**
 * LA FORMA DI `nodes.data`, UNA RIGA PER TIPO — l'eccezione che `graph.ts` chiede: dichiarata in
 * un posto solo, accanto al modello che la governa, così il tipo dodicesimo è una riga e non un
 * `if` sparso in cinque file.
 *
 * `nodes.type` ha un CHECK (`nodes_type_check`, vedi `org-data/checks.ts`) che ammette 12 valori.
 * Il CHECK ferma il `type` sbagliato; `data` è `jsonb` e Postgres accetta qualunque JSON — nessun
 * vincolo lo controlla. Un agente che chiama `insert_row('nodes', …)` doveva INDOVINARE la forma:
 * questo file è quella forma, e `validateNodeData` è la funzione che la applica.
 *
 * I LIMITI DEL MODELLO NON VIVONO QUI. Aspect ratio, durate, tetto del prompt sono fatti del
 * MODELLO scelto (`media-model-slots`, `get_media_models`): duplicarli in questo schema darebbe
 * due verità che divergono, e un rifiuto scoperto dopo aver pagato. Per questo `aspect_ratio`,
 * `resolution`, `duration` sono stringhe/numeri liberi qui — il catalogo del modello li giudica,
 * non questo file.
 *
 * QUESTO FILE VIVE IN `src/lib/canvas/`, non in `org-data/`: la validazione deve essere IDENTICA
 * per l'app (quando scriverà `nodes` direttamente) e per l'MCP (`insert_row`/`update_row` via
 * `write-tool.ts`) — un pacchetto solo, letto da entrambi, invece di due copie che divergono al
 * primo campo aggiunto.
 */
import { z } from 'zod';
import { SOCIAL_PLATFORMS } from './social-platforms';
import { EFFECTS } from './effects';

/** Lo stato di una generazione lunga: gli stessi campi per i tre tipi che generano davvero. */
const GEN_STATUS = ['idle', 'running', 'done', 'failed'] as const;

const genState = {
  status: z.enum(GEN_STATUS).optional(),
  run_id: z.string().optional(),
  error: z.string().nullable().optional(),
  output_asset_id: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
  cost_usd: z.number().optional()
};

/**
 * Lo stato di una SINCRONIZZAZIONE: gli stessi campi per `products` e `social_account_feed`, i
 * due nodi che non generano ma scaricano. Non è `genState` — non c'è un `run_id` da rincorrere
 * su un provider asincrono, il giro finisce dentro la stessa richiesta — ma la forma "in corso /
 * fatto / fallito con un motivo leggibile" è la stessa idea, ed è per questo che vive qui accanto
 * e non duplicata due volte.
 */
const syncState = {
  sync_status: z.enum(GEN_STATUS).optional(),
  sync_error: z.string().nullable().optional(),
  synced_count: z.number().optional(),
  synced_at: z.string().nullable().optional()
};

const textSchema = z.object({
  system_prompt: z.string().optional(),
  prompt: z.string(),
  model: z.string().nullable().optional(),
  reasoning: z.string().optional(),
  ...genState
});

const libraryMedia = {
  assetId: z.string().optional(),
  url: z.string().optional(),
  name: z.string().optional(),
  mimeType: z.string().optional()
};

const imageSchema = z.object({
  prompt: z.string(),
  model: z.string().nullable().optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  ...genState,
  ...libraryMedia
});

const videoSchema = z.object({
  prompt: z.string(),
  model: z.string().nullable().optional(),
  audio: z.boolean().optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  ...genState,
  ...libraryMedia
});

const docSchema = z.object({
  content: z.string(),
  public: z.boolean()
});

/**
 * Stessa protezione di `iframe-node.ts::normalizeEmbedUrl`: solo `http:`/`https:`. `javascript:`
 * eseguirebbe sull'origine di chi incorpora, `data:` porterebbe un documento arbitrario, `file:`
 * punterebbe al disco di chi guarda — nessuno dei tre ha un uso legittimo su questo campo.
 */
const EMBEDDABLE_PROTOCOLS = ['http:', 'https:'];

function isEmbeddableUrl(raw: string): boolean {
  try {
    return EMBEDDABLE_PROTOCOLS.includes(new URL(raw).protocol);
  } catch {
    return false;
  }
}

const iframeSchema = z
  .object({
    url: z.string().refine(isEmbeddableUrl, { message: 'solo indirizzi http e https' }).optional(),
    content: z.string().optional()
  })
  .refine((v) => Boolean(v.url) || Boolean(v.content), {
    message: 'serve url o content — una pagina incorporata senza nessuno dei due non mostra niente'
  });

const socialAccountFeedSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z.string().min(1),
  limit: z.number().int().positive().optional(),
  after: z.string().nullable().optional(),
  ...syncState
});

const mockupPost = z.object({
  caption: z.string().optional(),
  media: z.array(z.unknown()).optional()
});

const socialPostMockupSchema = z.object({
  general: z
    .object({
      caption: z.string().optional(),
      media: z.array(z.unknown()).optional(),
      first_comment: z.string().nullable().optional()
    })
    .optional(),
  x: z.object({ posts: z.array(mockupPost) }).optional(),
  threads: z.object({ posts: z.array(mockupPost) }).optional()
});

/** Gli stessi valori di `products_platform_check`. */
const PRODUCT_PLATFORMS = ['shopify', 'woocommerce'] as const;

const productsSchema = z.object({
  type: z.enum(PRODUCT_PLATFORMS),
  url: z.string().url(),
  limit: z.number().int().positive().optional(),
  after: z.string().nullable().optional(),
  only_first_photo: z.boolean().optional(),
  ...syncState
});

/**
 * Due modi, un solo `mode`. Il CHECK non può imporre «page_id quando mode=page»: è codice, non
 * schema — la stessa scelta che `NEW_DATABASE_STRUCTURE.md` propone e che qui si applica con
 * `superRefine`, l'unico posto dove la coppia resta onesta.
 */
const adsBase = z.object({
  mode: z.enum(['page', 'search']),
  page_id: z.string().optional(),
  page_name: z.string().optional(),
  search_terms: z.string().optional(),
  country: z.string().min(2),
  active_only: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  after: z.string().nullable().optional()
});

const adsSchema = adsBase.superRefine((v, ctx) => {
  if (v.mode === 'page' && !v.page_id) {
    ctx.addIssue({ code: 'custom', path: ['page_id'], message: 'mode "page" richiede page_id' });
  }
  if (v.mode === 'page' && v.search_terms) {
    ctx.addIssue({ code: 'custom', path: ['search_terms'], message: 'mode "page" non ammette search_terms' });
  }
  if (v.mode === 'search' && !v.search_terms) {
    ctx.addIssue({ code: 'custom', path: ['search_terms'], message: 'mode "search" richiede search_terms' });
  }
  if (v.mode === 'search' && v.page_id) {
    ctx.addIssue({ code: 'custom', path: ['page_id'], message: 'mode "search" non ammette page_id' });
  }
});

/**
 * `influencer`: nasce già pieno, come `products` — la riga in `influencers` esiste prima che il
 * nodo la referenzi, `influencer_id` è l'unico campo che il CHECK impone. `data` non porta le
 * viste (sarebbero decine di URL che viaggiano a ogni evento realtime, lo stesso motivo per cui
 * `products` non porta il catalogo): il server le legge da `influencer_views` e le passa come
 * prop a `InfluencerNode.svelte`, la stessa dottrina di `ProductsNode.svelte`.
 */
const influencerSchema = z.object({
  influencer_id: z.string()
});

/**
 * `list`: N valori, un `item_kind` solo — immagini o testo, mai mischiati, perché un'iterazione
 * (`loop-plan.ts`) pesca un valore alla volta dallo stesso connettore per tutta la lista. Un
 * `item` porta o `asset_id` (trascinato da un altro nodo/dalla libreria) o `text` (scritto o
 * incollato a mano); mai entrambi vuoti — un item senza contenuto non è un'iterazione, è un buco.
 */
const LIST_ITEM_KINDS = ['image', 'text'] as const;

const listItemSchema = z
  .object({
    label: z.string().optional(),
    asset_id: z.string().optional(),
    text: z.string().optional(),
    url: z.string().optional()
  })
  .refine((v) => Boolean(v.asset_id) || Boolean(v.text) || Boolean(v.url), {
    message: 'ogni item serve un asset_id, un text o un url'
  });

const listSchema = z.object({
  item_kind: z.enum(LIST_ITEM_KINDS),
  items: z.array(listItemSchema)
});

/**
 * `select`: sceglie UN item da una lista a monte, per indice. `index` È 1-BASED — la stessa cifra
 * che compare nel nodo e nel thumbnail cliccato, senza una traduzione da tenere sincronizzata fra
 * UI e storage. Fuori range o lista vuota non è un errore di schema (dipende da un'altra riga, che
 * questo file non vede): lo dice `resolveUpstreamInputs`, con `rejected`/`blocked` come ogni altro
 * ingresso mancante.
 */
const selectSchema = z.object({
  index: z.number().int().positive()
});

/**
 * `effects`: una PILA di effetti sopra un'immagine a monte (`sourceRefId`), il risultato applicato
 * in `refId` — lo stesso schema `refId`/`sourceRefId` di un nodo che genera, ma senza `genState`:
 * non c'è un provider da aspettare, `applyStack` (`effects/index.ts`) gira nel browser. Ogni `id`
 * di `EffectStep` deve esistere nella tabella `EFFECTS`: un id sconosciuto (un effetto tolto dal
 * catalogo, un refuso scritto a mano) rifiuta il nodo invece di applicare silenziosamente niente.
 */
const effectStepSchema = z.object({
  id: z.string().refine((id) => id in EFFECTS, { message: 'effetto sconosciuto' }),
  params: z.record(z.string(), z.union([z.number(), z.string()])),
  enabled: z.boolean().default(true)
});

const effectsSchema = z.object({
  effects: z.array(effectStepSchema).default([]),
  refId: z.string().nullish(),
  sourceRefId: z.string().nullish()
});

/**
 * LA TABELLA — un tipo nuovo è una riga qui, non un `if` in `write-tool.ts`. `nodes_type_check`
 * (vedi `org-data/checks.ts`) deve restare la stessa lista, e `node-data.test.ts` lo verifica.
 */
export const NODE_DATA_SCHEMAS = {
  text: textSchema,
  image: imageSchema,
  video: videoSchema,
  doc: docSchema,
  iframe: iframeSchema,
  social_account_feed: socialAccountFeedSchema,
  social_post_mockup: socialPostMockupSchema,
  products: productsSchema,
  ads: adsSchema,
  influencer: influencerSchema,
  list: listSchema,
  select: selectSchema,
  effects: effectsSchema
} as const;

export type NodeType = keyof typeof NODE_DATA_SCHEMAS;

export const NODE_TYPES = Object.keys(NODE_DATA_SCHEMAS) as NodeType[];

export function isNodeType(x: string): x is NodeType {
  return (NODE_TYPES as readonly string[]).includes(x);
}

export type NodeDataVerdict = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

/**
 * LA STESSA TABELLA, VERSO L'ESTERNO — un agente che chiama `insert_row('nodes', …)` non deve
 * indovinare la forma di `data`: qui la chiede per tipo, o per tutti e dieci insieme.
 *
 * `z.toJSONSchema` deriva lo schema DA `NODE_DATA_SCHEMAS`, mai una copia scritta a mano: le due
 * cose sono la stessa riga letta due volte, e non possono divergere al prossimo campo aggiunto.
 * Il `$schema` che l'SDK ripete su ogni tool costava 10.948 caratteri altrove (vedi
 * `tool-surface-cost.test.ts`) — qui si toglie per lo stesso motivo, un client non lo legge.
 */
export function describeNodeType(type: NodeType): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(NODE_DATA_SCHEMAS[type]) as Record<string, unknown>;
  return schema;
}

export function describeNodeTypes(): Record<NodeType, Record<string, unknown>> {
  return Object.fromEntries(NODE_TYPES.map((type) => [type, describeNodeType(type)])) as Record<
    NodeType,
    Record<string, unknown>
  >;
}

/**
 * LA FORMA CHE VA NEL DATABASE — required + enum del discriminante, e nient'altro.
 *
 * `describeNodeType` è per l'agente: gli serve ogni vincolo (`minLength`, `format: uri`, i
 * campi opzionali) per non indovinare. Un CHECK con `pg_jsonschema` è un'altra cosa — è
 * l'ULTIMA riga di difesa, quella che nessuno scavalca nemmeno con la service-role key, e per
 * questo deve restare permissiva: stringere un vincolo lì dentro vuol dire rivalidare ogni riga
 * esistente, mentre stringere `NODE_DATA_SCHEMAS` è solo codice che cambia. Qui si tiene SOLO
 * ciò che non cambierà mai senza una migrazione dei dati — quali campi esistono e, quando è un
 * enum, quali valori — mai un `minLength`, un `format`, un tetto numerico.
 *
 * DERIVATA DALLA STESSA `NODE_DATA_SCHEMAS`, non riscritta a mano: la migrazione che usa questa
 * funzione incolla il suo output com'è (vedi lo script che la genera), così le due verità — lo
 * schema che risponde all'agente e il CHECK che il database impone — restano la stessa riga
 * letta due volte, non due file che un domani divergono in silenzio.
 */
export function looseNodeJsonSchema(type: NodeType): Record<string, unknown> {
  const full = z.toJSONSchema(NODE_DATA_SCHEMAS[type]) as {
    type?: string;
    required?: string[];
    properties?: Record<string, { type?: string; enum?: unknown[] }>;
  };

  const required = full.required ?? [];
  const properties: Record<string, unknown> = {};
  for (const key of required) {
    const prop = full.properties?.[key];
    if (!prop) continue;
    properties[key] = prop.enum ? { type: prop.type, enum: prop.enum } : { type: prop.type };
  }

  return { type: 'object', required, properties };
}

export function validateNodeData(type: string, data: unknown): NodeDataVerdict {
  if (!isNodeType(type)) {
    return { ok: false, error: `type sconosciuto: "${type}". Sono ${NODE_TYPES.join(', ')}.` };
  }

  const schema = NODE_DATA_SCHEMAS[type];
  const result = schema.safeParse(data ?? {});
  if (result.success) {
    return { ok: true, data: result.data as Record<string, unknown> };
  }

  const [issue] = result.error.issues;
  const field = issue.path.length ? issue.path.join('.') : '(radice)';
  return { ok: false, error: `${type}.data.${field}: ${issue.message}` };
}

/**
 * Un `update_row` legittimo tocca UN campo (`data.status`, un nuovo `prompt`) senza rimandare gli
 * altri. Si valida il RISULTATO — la riga esistente con la patch sopra — non la patch da sola: una
 * patch che manda `status: 'done'` senza `prompt` non è mai valida da sola su `text`, ma lo È
 * quando si fonde con la riga che il prompt ce l'ha già. Validare la patch isolata rifiuterebbe
 * ogni update parziale legittimo.
 */
export function validateNodeDataPatch(type: string, current: unknown, patch: unknown): NodeDataVerdict {
  const currentObj = (current ?? {}) as Record<string, unknown>;
  const patchObj = (patch ?? {}) as Record<string, unknown>;
  return validateNodeData(type, { ...currentObj, ...patchObj });
}
