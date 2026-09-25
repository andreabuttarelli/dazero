import { GEN_MEDIUMS, type GenMedium, type GenNode, type GenParams } from '$lib/canvas/gen-node';
import { sourceOf, type IframeNode } from '$lib/canvas/iframe-node';
import type { DocNode } from '$lib/canvas/doc-node';
import type { Addable } from '$lib/canvas/addable';
import { isProductPlatform, type ProductsNode } from '$lib/canvas/products-node';
import { isSocialFeedPlatform, type SocialFeedNode } from '$lib/canvas/social-feed-node';
import { SYNC_STATUSES, type SyncStatus } from '$lib/canvas/sync-state';
import { isListItemKind, type ListItem, type ListNode } from '$lib/canvas/list-node';
import type { SelectNode } from '$lib/canvas/select-node';
import { EFFECTS, type EffectStep } from '$lib/canvas/effects';
import type { EffectsNode } from '$lib/canvas/effects-node';
import { LAYOUTS } from '$lib/canvas/composition/index';
import { CAMERA_PRESETS } from '$lib/canvas/composition/camera';
import type { CompositionNode } from '$lib/canvas/composition-node';
export { influencerNodeOf as influencerOf, type InfluencerNode } from '$lib/canvas/influencer-node';

/**
 * DA UNA RIGA DI `nodes` A QUEL CHE SI DISEGNA, E RITORNO.
 *
 * Lo schema nuovo tiene due colonne dove il vecchio ne teneva otto: `type` dice cosa una cosa è,
 * `data` porta tutto il resto in JSON. È il posto in cui quel JSON smette di essere un `any` che
 * gira per la pagina — una volta sola, all'ingresso, e da lì in poi i componenti vedono i tipi
 * che già conoscono (`GenNode`, `IframeNode`) senza sapere che vengono da un blob.
 *
 * IL MEDIUM È IL TIPO, e non una seconda colonna accanto: `brand_canvas_items` teneva `ref_kind`
 * e `medium` insieme, e due verità sulla stessa cosa divergono — una riga `gen` senza medium era
 * disegnabile e non si sapeva come. Qui un'immagine è `type = 'image'`, e non c'è un secondo
 * campo che possa dire altro.
 *
 * `data` ARRIVA DA UN DATABASE, NON DA UN COSTRUTTORE: una riga scritta da una versione di prima,
 * o dall'agente, può avere un numero dove la pagina si aspetta una stringa. Si legge con una
 * riserva per campo invece di fidarsi — un `prompt` numerico che arriva intatto dentro un
 * `<textarea>` è una pagina che esplode al disegno, cioè il difetto più lontano dalla sua causa.
 */
export const NODE_TYPES = [
  'text',
  'image',
  'video',
  'iframe',
  'doc',
  'products',
  'social_account_feed',
  'influencer',
  'list',
  'select',
  'effects'
] as const;

function syncStatusOf(v: unknown): SyncStatus {
  return typeof v === 'string' && (SYNC_STATUSES as readonly string[]).includes(v) ? (v as SyncStatus) : 'idle';
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export type NodeType = (typeof NODE_TYPES)[number];

export function isNodeType(x: string): x is NodeType {
  return (NODE_TYPES as readonly string[]).includes(x);
}

export type NodeRow = { id: string; type: string; data: Record<string, unknown> };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const nullableStr = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v : null;

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function isGenType(type: string): type is GenMedium {
  return (GEN_MEDIUMS as readonly string[]).includes(type);
}

/** Il nodo che produce dietro una riga, o null quando quella riga è un'altra cosa. */
export function genOf(row: NodeRow): GenNode | null {
  if (!isGenType(row.type)) {
    return null;
  }

  return {
    id: row.id,
    medium: row.type,
    model: nullableStr(row.data.model),
    prompt: str(row.data.prompt),
    params: record(row.data.params) as GenParams,
    refId: nullableStr(row.data.refId),
    runs: [],
    running: row.data.running === true,
    error: typeof row.data.error === 'string' && row.data.error ? row.data.error : null
  };
}

/** La pagina incorporata dietro una riga, o null quando quella riga è un'altra cosa. */
export function frameOf(row: NodeRow): IframeNode | null {
  if (row.type !== 'iframe') {
    return null;
  }

  const url = str(row.data.url);
  const html = str(row.data.html);

  return { id: row.id, source: sourceOf({ url, html }), url, html };
}

/** Il documento dietro una riga, o null quando quella riga è un'altra cosa. */
export function docOf(row: NodeRow): DocNode | null {
  if (row.type !== 'doc') {
    return null;
  }

  return {
    id: row.id,
    content: str(row.data.content),
    public: row.data.public === true
  };
}

/** Il nodo `products` dietro una riga, o null quando quella riga è un'altra cosa. */
export function productsOf(row: NodeRow): ProductsNode | null {
  if (row.type !== 'products') {
    return null;
  }

  const platform = row.data.type;

  return {
    id: row.id,
    platform: typeof platform === 'string' && isProductPlatform(platform) ? platform : 'shopify',
    url: str(row.data.url),
    limit: num(row.data.limit, 20),
    after: nullableStr(row.data.after),
    onlyFirstPhoto: row.data.only_first_photo === true,
    syncStatus: syncStatusOf(row.data.sync_status),
    syncError: nullableStr(row.data.sync_error),
    syncedCount: num(row.data.synced_count, 0),
    syncedAt: nullableStr(row.data.synced_at)
  };
}

/** Il nodo `social_account_feed` dietro una riga, o null quando quella riga è un'altra cosa. */
export function socialFeedOf(row: NodeRow): SocialFeedNode | null {
  if (row.type !== 'social_account_feed') {
    return null;
  }

  const platform = row.data.platform;

  return {
    id: row.id,
    platform: typeof platform === 'string' && isSocialFeedPlatform(platform) ? platform : 'instagram',
    handle: str(row.data.handle),
    limit: num(row.data.limit, 20),
    syncStatus: syncStatusOf(row.data.sync_status),
    syncError: nullableStr(row.data.sync_error),
    syncedCount: num(row.data.synced_count, 0),
    syncedAt: nullableStr(row.data.synced_at)
  };
}

/** L'item dietro una riga di `list.data.items`, con la stessa riserva per campo di ogni lettura
 *  da un jsonb — mai un item malformato che rompe il disegno. */
function listItemOf(v: unknown): ListItem {
  const item = record(v);
  const status = item.status;
  return {
    label: nullableStr(item.label) ?? undefined,
    asset_id: nullableStr(item.asset_id) ?? undefined,
    text: nullableStr(item.text) ?? undefined,
    url: nullableStr(item.url) ?? undefined,
    status: typeof status === 'string' ? (status as ListItem['status']) : undefined,
    run_id: nullableStr(item.run_id) ?? undefined
  };
}

/** Il nodo `list` dietro una riga, o null quando quella riga è un'altra cosa. */
export function listOf(row: NodeRow): ListNode | null {
  if (row.type !== 'list') {
    return null;
  }

  const kind = row.data.item_kind;
  const items = Array.isArray(row.data.items) ? row.data.items.map(listItemOf) : [];

  return {
    id: row.id,
    itemKind: typeof kind === 'string' && isListItemKind(kind) ? kind : 'image',
    items
  };
}

/** Il nodo `select` dietro una riga, o null quando quella riga è un'altra cosa. */
export function selectOf(row: NodeRow): SelectNode | null {
  if (row.type !== 'select') {
    return null;
  }

  return { id: row.id, index: num(row.data.index, 1) };
}

/** Un item della pila di `effects.data.effects`, con la stessa riserva per campo di ogni lettura
 *  da un jsonb — un id sconosciuto (un effetto tolto dal catalogo) sparisce dalla pila invece di
 *  rompere il disegno: `applyStack` lo ignora già allo stesso modo. */
function effectStepOf(v: unknown): EffectStep | null {
  const step = record(v);
  const id = step.id;
  if (typeof id !== 'string' || !(id in EFFECTS)) {
    return null;
  }
  return { id: id as EffectStep['id'], params: record(step.params) as EffectStep['params'], enabled: step.enabled !== false };
}

/** Il nodo `effects` dietro una riga, o null quando quella riga è un'altra cosa. */
export function effectsOf(row: NodeRow): EffectsNode | null {
  if (row.type !== 'effects') {
    return null;
  }

  const effects = Array.isArray(row.data.effects)
    ? row.data.effects.map(effectStepOf).filter((s): s is EffectStep => s !== null)
    : [];

  return {
    id: row.id,
    effects,
    refId: nullableStr(row.data.refId),
    sourceRefId: nullableStr(row.data.sourceRefId)
  };
}

const DEFAULT_COMPOSITION_LAYOUT = Object.keys(LAYOUTS)[0] as keyof typeof LAYOUTS;
const DEFAULT_COMPOSITION_CAMERA = Object.keys(CAMERA_PRESETS)[0] as keyof typeof CAMERA_PRESETS;
const DEFAULT_COMPOSITION_DURATION = 6;
const DEFAULT_COMPOSITION_ASPECT: CompositionNode['aspect'] = '9:16';

/** Il nodo `composition` dietro una riga, o null quando quella riga è un'altra cosa. */
export function compositionOf(row: NodeRow): CompositionNode | null {
  if (row.type !== 'composition') {
    return null;
  }

  const camera = record(row.data.camera);
  const background = record(row.data.background);
  const layout = row.data.layout;
  const cameraPreset = camera.preset;

  return {
    id: row.id,
    layout: typeof layout === 'string' && layout in LAYOUTS ? (layout as CompositionNode['layout']) : DEFAULT_COMPOSITION_LAYOUT,
    layoutParams: record(row.data.layoutParams) as CompositionNode['layoutParams'],
    camera: {
      preset:
        typeof cameraPreset === 'string' && cameraPreset in CAMERA_PRESETS
          ? (cameraPreset as CompositionNode['camera']['preset'])
          : DEFAULT_COMPOSITION_CAMERA,
      params: record(camera.params) as CompositionNode['camera']['params']
    },
    background: { color: typeof background.color === 'string' ? background.color : '#000000' },
    duration: num(row.data.duration, DEFAULT_COMPOSITION_DURATION),
    aspect: (['9:16', '1:1', '16:9'] as const).includes(row.data.aspect as never)
      ? (row.data.aspect as CompositionNode['aspect'])
      : DEFAULT_COMPOSITION_ASPECT,
    refId: nullableStr(row.data.refId)
  };
}

export function compositionData(node: CompositionNode): Record<string, unknown> {
  return {
    layout: node.layout,
    layoutParams: node.layoutParams,
    camera: node.camera,
    background: node.background,
    duration: node.duration,
    aspect: node.aspect,
    refId: node.refId
  };
}

/**
 * Con che contenuto una riga nasce. Vuoto in entrambi i casi, e per lo stesso motivo: scegliere
 * un modello o un indirizzo al posto di chi aggiunge il nodo è una decisione presa per lui — e
 * sul nodo che produce sarebbe una decisione che costa crediti.
 */
export function newNodeRow(what: Addable): Record<string, unknown> {
  if (what === 'iframe') {
    return { url: '', html: '' };
  }

  if (what === 'doc') {
    return { content: '', public: false };
  }

  if (what === 'products') {
    return { type: 'shopify', url: '', limit: 20, after: null, only_first_photo: false };
  }

  if (what === 'social_account_feed') {
    return { platform: 'instagram', handle: '', limit: 20 };
  }

  if (what === 'list') {
    return { item_kind: 'image', items: [] };
  }

  if (what === 'select') {
    return { index: 1 };
  }

  if (what === 'effects') {
    return { effects: [], refId: null, sourceRefId: null };
  }

  if (what === 'composition') {
    return {
      layout: DEFAULT_COMPOSITION_LAYOUT,
      layoutParams: {},
      camera: { preset: DEFAULT_COMPOSITION_CAMERA, params: {} },
      background: { color: '#000000' },
      duration: DEFAULT_COMPOSITION_DURATION,
      aspect: DEFAULT_COMPOSITION_ASPECT,
      refId: null
    };
  }

  return { prompt: '', model: null, params: {}, refId: null };
}

/** Quel che di un nodo che produce si scrive: `runs` resta fuori — è storia, non contenuto. */
export function genData(node: GenNode): Record<string, unknown> {
  return {
    prompt: node.prompt,
    model: node.model,
    params: node.params,
    refId: node.refId,
    running: node.running === true,
    error: node.error ?? null
  };
}

export function frameData(node: IframeNode): Record<string, unknown> {
  return { url: node.url, html: node.html };
}

export function docData(node: DocNode): Record<string, unknown> {
  return { content: node.content, public: node.public };
}

/**
 * Quel che di un nodo `products` si scrive. Lo stato di sincronizzazione (`syncStatus`…) VIAGGIA
 * col resto — a differenza di `runs` sul nodo che produce, qui non c'è una tabella `node_runs`
 * separata per questi due tipi: un solo giro alla volta, il risultato precedente non è "storia"
 * da tenere, è lo stato corrente che il prossimo giro sovrascrive.
 */
export function productsData(node: ProductsNode): Record<string, unknown> {
  return {
    type: node.platform,
    url: node.url,
    limit: node.limit,
    after: node.after,
    only_first_photo: node.onlyFirstPhoto,
    sync_status: node.syncStatus,
    sync_error: node.syncError,
    synced_count: node.syncedCount,
    synced_at: node.syncedAt
  };
}

export function socialFeedData(node: SocialFeedNode): Record<string, unknown> {
  return {
    platform: node.platform,
    handle: node.handle,
    limit: node.limit,
    sync_status: node.syncStatus,
    sync_error: node.syncError,
    synced_count: node.syncedCount,
    synced_at: node.syncedAt
  };
}

export function listData(node: ListNode): Record<string, unknown> {
  return { item_kind: node.itemKind, items: node.items };
}

export function selectData(node: SelectNode): Record<string, unknown> {
  return { index: node.index };
}

export function effectsData(node: EffectsNode): Record<string, unknown> {
  return { effects: node.effects, refId: node.refId, sourceRefId: node.sourceRefId };
}
