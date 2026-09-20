import { describe, it, expect, vi } from 'vitest';
import { HISTORY_LIMIT, loadTurns } from './turns';

function dbReturning(rows: unknown[]) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      calls[col] = val;
      return builder;
    },
    order: (col: string, opts: unknown) => {
      calls.orderBy = col;
      calls.orderOpts = opts;
      return builder;
    },
    limit: (n: number) => {
      calls.limit = n;
      return Promise.resolve({ data: rows, error: null });
    }
  };
  return { from: () => builder, calls };
}

describe('loadTurns — la memoria che il modello rilegge', () => {
  it('tiene solo ruolo e contenuto: il resto non è un messaggio', async () => {
    // Righe come le rende la query: dalla più recente alla più vecchia.
    const db = dbReturning([
      { role: 'assistant', content: 'ciao a te', input_tokens: 9 },
      { role: 'user', content: 'ciao', model: 'x', duration_ms: 12 }
    ]);

    expect(await loadTurns(db as never, 't1')).toEqual([
      { role: 'user', content: 'ciao' },
      { role: 'assistant', content: 'ciao a te' }
    ]);
  });

  /**
   * IL COSTO, di nuovo: la cronologia intera viaggia nel prompt a ogni messaggio. Senza tetto
   * una conversazione lunga diventa un conto che cresce da solo a ogni turno.
   */
  it('si ferma al tetto invece di rimandare tutta la conversazione', async () => {
    const db = dbReturning([]);
    await loadTurns(db as never, 't1');
    expect(db.calls.limit).toBe(HISTORY_LIMIT);
  });

  /**
   * Gli ultimi N, non i primi N: una chat lunga deve ricordare quello che è appena successo.
   * Letti dal più recente e poi rimessi in ordine, altrimenti il modello legge la conversazione
   * al contrario — un difetto che non va in errore, produce solo risposte assurde.
   */
  it('prende gli ULTIMI messaggi e li rende in ordine cronologico', async () => {
    const db = dbReturning([
      { role: 'assistant', content: 'secondo' },
      { role: 'user', content: 'primo' }
    ]);

    const turns = await loadTurns(db as never, 't1');

    expect(db.calls.orderOpts).toMatchObject({ ascending: false });
    expect(turns.map((t) => t.content)).toEqual(['primo', 'secondo']);
  });

  it('salta i messaggi vuoti invece di mandare un turno cieco al modello', async () => {
    const db = dbReturning([
      { role: 'user', content: 'vero' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: null }
    ]);

    expect(await loadTurns(db as never, 't1')).toEqual([{ role: 'user', content: 'vero' }]);
  });
});
