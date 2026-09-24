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
