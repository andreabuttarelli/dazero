import { describe, it, expect } from 'vitest';
import { DELETE_ROW, DELETE_MAX_ROWS } from './write';

/**
 * CANCELLARE È L'UNICA SCRITTURA CHE NON SI CORREGGE.
 *
 * Un `insert` sbagliato si toglie, un `update` sbagliato si riscrive — se si sa cosa c'era prima.
 * Una riga cancellata non c'è più, e nessun tetto la riporta indietro. Per questo il tetto è più
 * basso di quello degli update e il filtro è obbligatorio: senza, una `where` dimenticata svuota
 * ogni riga che l'utente può raggiungere.
 */
describe('il contratto di delete_row', () => {
  it('cancella meno righe di quante un update ne riscrive', async () => {
    const { UPDATE_MAX_ROWS } = await import('./write');

    expect(DELETE_MAX_ROWS).toBeLessThan(UPDATE_MAX_ROWS);
    expect(DELETE_MAX_ROWS).toBe(10);
  });

  it('è dichiarato distruttivo: il protocollo lo dice al client PRIMA della chiamata', () => {
    expect(DELETE_ROW.destructive).toBe(true);
  });

  it('rifiuta una chiamata senza filtro, che svuoterebbe la tabella', () => {
    expect(DELETE_ROW.input.safeParse({ table: 'competitors', where: [] }).success).toBe(false);
  });

  it('accetta un filtro vero', () => {
    const parsed = DELETE_ROW.input.safeParse({
      table: 'competitors',
      where: [{ column: 'id', op: 'eq', value: 'x' }]
    });

    expect(parsed.success).toBe(true);
  });

  it('non prende valori da scrivere: cancellare non è aggiornare', () => {
    const parsed = DELETE_ROW.input.safeParse({
      table: 'competitors',
      where: [{ column: 'id', op: 'eq', value: 'x' }],
      values: { name: 'y' }
    });

    expect(parsed.success).toBe(false);
  });

  it('dice il tetto nella descrizione, dove il modello lo legge prima di provarci', () => {
    expect(DELETE_ROW.description).toContain(String(DELETE_MAX_ROWS));
  });
});
