import { describe, expect, it } from 'vitest';
import { fakeDb } from './fake-db';

const rows = {
  nodes: [
    { id: 'a', org_id: 'o1', deleted_at: null },
    { id: 'b', org_id: 'o1', deleted_at: null },
    { id: 'c', org_id: 'o2', deleted_at: '2026-01-01' }
  ]
};

describe('fakeDb con filter: le righe rispettano i filtri della query', () => {
  it('eq sceglie la riga giusta anche quando non è la prima', async () => {
    const { db } = fakeDb(rows, { filter: true });
    const { data } = await db.from('nodes').select('*').eq('org_id', 'o1').eq('id', 'b').is('deleted_at', null).maybeSingle();
    expect(data).toEqual(rows.nodes[1]);
  });

  it('is null esclude le righe cancellate, in sceglie fra più valori', async () => {
    const { db } = fakeDb(rows, { filter: true });
    const { data } = await db.from('nodes').select('*').in('id', ['a', 'c']).is('deleted_at', null);
    expect(data).toEqual([rows.nodes[0]]);
  });

  it('senza filter resta il comportamento di sempre: tutte le righe', async () => {
    const { db } = fakeDb(rows);
    const { data } = await db.from('nodes').select('*').eq('id', 'b').maybeSingle();
    expect(data).toEqual(rows.nodes[0]);
  });
});
