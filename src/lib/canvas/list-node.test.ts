import { describe, expect, it } from 'vitest';
import {
  addImageItem,
  addTextLines,
  canAcceptItemKind,
  listLabel,
  listNodeSize,
  newListNodeAt,
  reorderItem,
  removeItemAt,
  type ListNode
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
