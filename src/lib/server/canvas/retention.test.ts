import { describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db/client';
import { pruneOldCanvasEvents, CANVAS_EVENT_RETENTION_DAYS } from './retention';

/**
 * Un doppio minimo: solo `delete().lt()`, la forma esatta che `pruneOldCanvasEvents` chiama. Il
 * `count` torna come il `delete({ count: 'exact' })` di Supabase lo darebbe — un numero, non le
 * righe stesse, perché una potatura non ha bisogno di leggerle indietro.
 */
function fakeDb(count: number) {
  const calls: { table: string; lt?: [string, unknown] }[] = [];

  const db = {
    from: (table: string) => ({
      delete: (_opts: { count: string }) => {
        const call: { table: string; lt?: [string, unknown] } = { table };
        calls.push(call);
        return {
          lt: async (column: string, value: unknown) => {
            call.lt = [column, value];
            return { error: null, count };
          }
        };
      }
    })
  } as unknown as Db;

  return { db, calls };
}

describe('pruneOldCanvasEvents: pota per età, su ogni org insieme', () => {
  it('cancella sotto una soglia di 30 giorni per default', async () => {
    const { db, calls } = fakeDb(0);
    const now = new Date('2026-09-22T00:00:00Z');

    await pruneOldCanvasEvents(db, { now });

    const expectedCutoff = new Date(now.getTime() - CANVAS_EVENT_RETENTION_DAYS * 24 * 60 * 60_000).toISOString();
    expect(calls[0].table).toBe('canvas_events');
    expect(calls[0].lt).toEqual(['created_at', expectedCutoff]);
  });

  it('una soglia diversa si può passare esplicitamente', async () => {
    const { db, calls } = fakeDb(0);
    const now = new Date('2026-09-22T00:00:00Z');

    await pruneOldCanvasEvents(db, { now, retainDays: 7 });

    const expectedCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
    expect(calls[0].lt).toEqual(['created_at', expectedCutoff]);
  });

  it('restituisce quante righe sono cadute', async () => {
    const { db } = fakeDb(42);

    const result = await pruneOldCanvasEvents(db);

    expect(result).toEqual({ pruned: 42 });
  });

  it('un count nullo (nessuna riga scaduta) torna zero, non un errore', async () => {
    const { db } = fakeDb(0);

    const result = await pruneOldCanvasEvents(db);

    expect(result).toEqual({ pruned: 0 });
  });
});
