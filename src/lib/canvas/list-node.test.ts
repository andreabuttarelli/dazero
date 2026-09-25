import { describe, expect, it } from 'vitest';
import {
  addImageItem,
  addTextLines,
  canAcceptItemKind,
  listConnectors,
  listKindOf,
  listValues,
  wiresInto,
  listLabel,
  listNodeSize,
  newListNodeAt,
  reorderItem,
  removeItemAt,
  type ListNode,
  type WiredListSource
} from './list-node';

const emptyList = (kind: ListNode['itemKind'] = 'image'): ListNode => ({ id: 'l1', itemKind: kind, items: [] });

describe('una lista nasce vuota', () => {
  it('senza item, centrata sul punto', () => {
    const { w, h } = listNodeSize();
    const tile = newListNodeAt({ x: 100, y: 50 });

    expect(tile).toMatchObject({ x: 100 - w / 2, y: 50 - h / 2, items: [], connectable: true });
  });
});

describe('item_kind: immagini o testo, mai mischiati', () => {
  it('una lista vuota accetta qualunque medium', () => {
    expect(canAcceptItemKind(emptyList(), 'image')).toBe(true);
    expect(canAcceptItemKind(emptyList(), 'text')).toBe(true);
  });

  it('una lista già popolata accetta solo il suo stesso medium', () => {
    const list = addImageItem(emptyList(), { assetId: 'a1', url: 'https://x/a1.png' });
    expect(canAcceptItemKind(list, 'image')).toBe(true);
    expect(canAcceptItemKind(list, 'text')).toBe(false);
  });

  it('aggiungere testo a una lista di immagini non fa niente', () => {
    const list = addImageItem(emptyList(), { assetId: 'a1', url: 'https://x/a1.png' });
    const after = addTextLines(list, 'riga');
    expect(after).toBe(list);
  });
});

describe('aggiungere un item immagine', () => {
  it('porta assetId e url, e imposta item_kind', () => {
    const list = addImageItem(emptyList(), { assetId: 'a1', url: 'https://x/a1.png', label: 'gatto' });
    expect(list.itemKind).toBe('image');
    expect(list.items).toEqual([{ asset_id: 'a1', url: 'https://x/a1.png', label: 'gatto' }]);
  });
});

describe('aggiungere righe di testo', () => {
  it('una riga per item, righe vuote scartate', () => {
    const list = addTextLines(emptyList('text'), 'primo\n\nsecondo\n   \nterzo');
    expect(list.items.map((i) => i.text)).toEqual(['primo', 'secondo', 'terzo']);
  });

  it('un testo tutto vuoto non aggiunge niente', () => {
    const list = emptyList('text');
    const after = addTextLines(list, '   \n\n');
    expect(after).toBe(list);
  });
});

describe('togliere un item', () => {
  it('per indice, gli altri restano nello stesso ordine', () => {
    const list: ListNode = { id: 'l1', itemKind: 'text', items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] };
    const after = removeItemAt(list, 1);
    expect(after.items.map((i) => i.text)).toEqual(['a', 'c']);
  });

  it('un indice fuori range non tocca la lista', () => {
    const list: ListNode = { id: 'l1', itemKind: 'text', items: [{ text: 'a' }] };
    expect(removeItemAt(list, 5)).toBe(list);
    expect(removeItemAt(list, -1)).toBe(list);
  });
});

describe('riordinare un item', () => {
  it('sposta da un indice a un altro', () => {
    const list: ListNode = { id: 'l1', itemKind: 'text', items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] };
    const after = reorderItem(list, 0, 2);
    expect(after.items.map((i) => i.text)).toEqual(['b', 'c', 'a']);
  });

  it('clampa un destination fuori range invece di perdere l\'item', () => {
    const list: ListNode = { id: 'l1', itemKind: 'text', items: [{ text: 'a' }, { text: 'b' }] };
    const after = reorderItem(list, 0, 99);
    expect(after.items.map((i) => i.text)).toEqual(['b', 'a']);
  });

  it('una sorgente fuori range non tocca la lista', () => {
    const list: ListNode = { id: 'l1', itemKind: 'text', items: [{ text: 'a' }] };
    expect(reorderItem(list, 9, 0)).toBe(list);
  });
});

describe('l\'etichetta di un item', () => {
  it('usa label quando c\'è', () => {
    expect(listLabel({ label: 'variante 1' }, 4)).toBe('variante 1');
  });

  it('altrimenti la posizione, 1-based', () => {
    expect(listLabel({}, 0)).toBe('1');
    expect(listLabel({}, 4)).toBe('5');
  });
});

const wired = (nodeId: string, kind: WiredListSource['kind'], item: WiredListSource['item']): WiredListSource => ({ nodeId, kind, item });

describe('listValues — i valori di una lista: prima i manuali, poi i collegati', () => {
  it('solo manuali: gli item così come sono, nessun filo', () => {
    const list: ListNode = { id: 'l1', itemKind: 'image', items: [{ asset_id: 'a1', url: 'u1' }] };
    const out = listValues(list, []);
    expect(out.itemKind).toBe('image');
    expect(out.values).toEqual([{ item: { asset_id: 'a1', url: 'u1' }, wiredFrom: null }]);
    expect(out.pending).toEqual([]);
  });

  it('solo collegati: un valore per filo, nell ordine dei fili', () => {
    const out = listValues(emptyList(), [
      wired('n1', 'image', { asset_id: 'r1', url: 'u1' }),
      wired('n2', 'image', { asset_id: 'r2', url: 'u2' })
    ]);
    expect(out.values.map((v) => v.wiredFrom)).toEqual(['n1', 'n2']);
    expect(out.values.map((v) => v.item.asset_id)).toEqual(['r1', 'r2']);
  });

  it('entrambi: i collegati DOPO i manuali', () => {
    const list: ListNode = { id: 'l1', itemKind: 'text', items: [{ text: 'a mano' }] };
    const out = listValues(list, [wired('n1', 'text', { text: 'dal filo' })]);
    expect(out.values.map((v) => v.item.text)).toEqual(['a mano', 'dal filo']);
    expect(out.values.map((v) => v.wiredFrom)).toEqual([null, 'n1']);
  });

  it('una sorgente senza output non aggiunge niente, ma resta in attesa', () => {
    const out = listValues(emptyList(), [wired('n1', 'image', null), wired('n2', 'image', { asset_id: 'r2' })]);
    expect(out.values).toHaveLength(1);
    expect(out.pending).toEqual(['n1']);
  });

  it('una lista vuota prende il medium del primo filo', () => {
    const out = listValues(emptyList('image'), [wired('n1', 'text', { text: 'ciao' })]);
    expect(out.itemKind).toBe('text');
    expect(out.values.map((v) => v.item.text)).toEqual(['ciao']);
  });

  it('un filo di medium diverso da una lista già popolata non entra', () => {
    const list: ListNode = { id: 'l1', itemKind: 'image', items: [{ asset_id: 'a1' }] };
    const out = listValues(list, [wired('n1', 'text', { text: 'no' })]);
    expect(out.values).toHaveLength(1);
    expect(out.pending).toEqual([]);
  });
});

describe('listKindOf / listConnectors — la porta di ingresso di una lista', () => {
  it('una lista vuota senza fili non ha ancora un medium: accetta entrambe le porte', () => {
    expect(listKindOf(emptyList(), [])).toBeNull();
    expect(listConnectors(null)).toEqual(['text', 'images']);
  });

  it('una lista di immagini apre solo la porta images', () => {
    const list: ListNode = { id: 'l1', itemKind: 'image', items: [{ asset_id: 'a' }] };
    expect(listConnectors(listKindOf(list, []))).toEqual(['images']);
  });

  it('una lista vuota col primo filo testo apre solo la porta text', () => {
    expect(listConnectors(listKindOf(emptyList(), [wired('n1', 'text', null)]))).toEqual(['text']);
  });
});

describe('wiresInto — i fili di una lista, in ordine deterministico', () => {
  it('solo quelli che entrano nella lista, ordinati per id', () => {
    const edges = [
      { id: 'e2', sourceNodeId: 'b', targetNodeId: 'l1' },
      { id: 'e9', sourceNodeId: 'x', targetNodeId: 'other' },
      { id: 'e1', sourceNodeId: 'a', targetNodeId: 'l1' }
    ];
    expect(wiresInto('l1', edges).map((e) => e.sourceNodeId)).toEqual(['a', 'b']);
  });
});
