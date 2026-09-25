/**
 * IL NODO `list`: N valori, immagini O testo — mai mischiati, perché `item_kind` è uno solo per
 * lista (`node-data.ts::listSchema`) e un'iterazione di loop (`loop-axes.ts`) pesca un valore
 * alla volta dallo stesso connettore per tutta la lista. Nasce vuota — riempita a mano
 * trascinando asset sopra, scrivendo righe di testo — o già piena, come output di un loop
 * (`loop.ts::createOutputList`), un item per combinazione con `status: 'queued'` che diventa
 * `done`/`failed` mano a mano che il cron drena la coda.
 *
 * PURO: nessun database qui. `writeNodeData`/`write` (la pagina) restano l'unico posto che scrive
 * — questo file dice solo come una lista cambia, non come si salva.
 */
import type { ConnectorType } from './connectors';

export const LIST_ITEM_KINDS = ['image', 'text'] as const;

export type ListItemKind = (typeof LIST_ITEM_KINDS)[number];

export function isListItemKind(x: string): x is ListItemKind {
  return (LIST_ITEM_KINDS as readonly string[]).includes(x);
}

export const LIST_ITEM_STATUSES = ['queued', 'running', 'done', 'failed'] as const;

export type ListItemStatus = (typeof LIST_ITEM_STATUSES)[number];

export type ListItem = {
  label?: string;
  asset_id?: string;
  text?: string;
  url?: string;
  status?: ListItemStatus;
  run_id?: string;
};

export type ListNode = {
  id: string;
  itemKind: ListItemKind;
  items: ListItem[];
};

const LIST_NODE_SIZE = { w: 360, h: 320 };

export function listNodeSize(): { w: number; h: number } {
  return { ...LIST_NODE_SIZE };
}

export type NewListTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  item_kind: ListItemKind;
  items: ListItem[];
  connectable: true;
};

export function newListNodeAt(at: { x: number; y: number }): NewListTile {
  const { w, h } = listNodeSize();

  return {
    id: crypto.randomUUID(),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    item_kind: 'image',
    items: [],
    connectable: true
  };
}

/**
 * UNA LISTA VUOTA ACCETTA QUALUNQUE MEDIUM — il primo item scritto decide `item_kind` per tutti
 * quelli dopo. Un item di tipo diverso da una lista già popolata è rifiutato: la stessa disciplina
 * che `listSchema` impone lato server, applicata qui PRIMA di mandare la scrittura, così chi
 * trascina un video su una lista di testo vede il rifiuto subito e non dopo un giro di rete.
 */
export function canAcceptItemKind(list: ListNode, kind: ListItemKind): boolean {
  return list.items.length === 0 || list.itemKind === kind;
}

export function addImageItem(list: ListNode, item: { assetId: string; url: string; label?: string }): ListNode {
  if (!canAcceptItemKind(list, 'image')) return list;
  return {
    ...list,
    itemKind: 'image',
    items: [...list.items, { asset_id: item.assetId, url: item.url, label: item.label }]
  };
}

/** Una riga di testo per item: `text.split('\n')` scarta le righe vuote, così incollare un blocco
 *  con righe a capo doppie non lascia item fantasma senza contenuto. */
export function addTextLines(list: ListNode, text: string): ListNode {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !canAcceptItemKind(list, 'text')) return list;

  return {
    ...list,
    itemKind: 'text',
    items: [...list.items, ...lines.map((line) => ({ text: line }))]
  };
}

export function removeItemAt(list: ListNode, index: number): ListNode {
  if (index < 0 || index >= list.items.length) return list;
  return { ...list, items: list.items.filter((_, i) => i !== index) };
}

/** Sposta l'item da `from` a `to`, entrambi 0-based — clampati, mai un indice fuori lista che
 *  silenziosamente non farebbe niente o buttarebbe un item. */
export function reorderItem(list: ListNode, from: number, to: number): ListNode {
  if (from < 0 || from >= list.items.length) return list;
  const clampedTo = Math.max(0, Math.min(to, list.items.length - 1));
  if (from === clampedTo) return list;

  const items = [...list.items];
  const [moved] = items.splice(from, 1);
  items.splice(clampedTo, 0, moved);
  return { ...list, items };
}

export function listLabel(item: ListItem, index: number): string {
  return item.label?.trim() || `${index + 1}`;
}

/** Un nodo collegato alla porta di una lista: il medium che porta, e il suo output di ora —
 *  `null` finché non ha ancora prodotto niente. */
export type WiredListSource = { nodeId: string; kind: ListItemKind; item: ListItem | null };

export type ListValue = { item: ListItem; wiredFrom: string | null };

export type ListValues = { itemKind: ListItemKind; values: ListValue[]; pending: string[] };

const WIRED_KIND: Partial<Record<string, ListItemKind>> = { image: 'image', text: 'text', doc: 'text' };

/** Il medium che un nodo di questo tipo porta in una lista, o null quando non ne porta. */
export function wiredKindOf(nodeType: string): ListItemKind | null {
  return WIRED_KIND[nodeType] ?? null;
}

/** I fili che entrano in una lista, per id — lo stesso ordine di `upstream-inputs.ts::incomingEdges`. */
export function wiresInto<E extends { id: string; targetNodeId: string }>(listId: string, edges: E[]): E[] {
  return edges.filter((e) => e.targetNodeId === listId).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Il medium di una lista: quello dei suoi item, o del primo filo quando è vuota; null se nessuno dei due. */
export function listKindOf(list: Pick<ListNode, 'itemKind' | 'items'>, wired: WiredListSource[]): ListItemKind | null {
  if (list.items.length) return list.itemKind;
  return wired[0]?.kind ?? null;
}

const LIST_PORT: Record<ListItemKind, ConnectorType> = { image: 'images', text: 'text' };

export function listConnectors(kind: ListItemKind | null): ConnectorType[] {
  return kind ? [LIST_PORT[kind]] : ['text', 'images'];
}

/**
 * I VALORI DI UNA LISTA, L'UNICA RISPOSTA — loop, `select`, un nodo a valle e la tile leggono
 * questa, mai `items` da soli. Prima gli item scritti a mano, poi l'output vivo di ogni filo
 * nell'ordine dei fili. Un filo il cui nodo non ha ancora prodotto non è un valore: è `pending`,
 * che la tile mostra e il loop non conta. Un filo di medium diverso dalla lista non entra affatto.
 */
export function listValues(list: Pick<ListNode, 'itemKind' | 'items'>, wired: WiredListSource[]): ListValues {
  const itemKind = listKindOf(list, wired) ?? list.itemKind;
  const matching = wired.filter((w) => w.kind === itemKind);

  const values: ListValue[] = [
    ...list.items.map((item) => ({ item, wiredFrom: null })),
    ...matching.filter((w) => w.item).map((w) => ({ item: w.item!, wiredFrom: w.nodeId }))
  ];
  const pending = matching.filter((w) => !w.item).map((w) => w.nodeId);

  return { itemKind, values, pending };
}
