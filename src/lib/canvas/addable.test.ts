import { describe, it, expect } from 'vitest';
import { CANVAS_ADDABLE, isAddable, isGenAddable } from './addable';
import { GEN_MEDIUMS } from './gen-node';

/**
 * DUE DOMANNE DIVERSE, E CONFONDERLE È IL DIFETTO CHE QUESTO FILE EVITA.
 *
 *   `GEN_MEDIUMS` — cosa un nodo PRODUCE. Tre, e li decide il catalogo dei modelli.
 *   `CANVAS_ADDABLE` — cosa si può METTERE sulla tela. Quei tre più la pagina incorporata e il
 *   documento, che non producono niente: portano qualcosa che esiste già.
 *
 * Allargare `GEN_MEDIUMS` con `iframe` o `doc` sarebbe costato poco oggi e avrebbe detto una
 * falsità che si propaga: `defaultParamsFor`, `promptTooLong` e il catalogo dei modelli gli
 * girano attorno, e nessuna di quelle domande ha senso per chi non produce.
 */
describe('cosa si può mettere sulla tela', () => {
  it('contiene i tre medium che si producono, la pagina incorporata, il documento, le due sorgenti che scaricano e i due nodi di loop', () => {
    expect(CANVAS_ADDABLE).toEqual([
      ...GEN_MEDIUMS,
      'iframe',
      'doc',
      'products',
      'social_account_feed',
      'list',
      'select'
    ]);
  });

  it('non allarga i medium che un nodo produce', () => {
    // Il test che tiene i due concetti separati: se qualcuno mettesse `doc` fra i medium,
    // qui diventerebbe rosso.
    expect(GEN_MEDIUMS).not.toContain('doc');
    expect(GEN_MEDIUMS).not.toContain('iframe');
  });

  it('riconosce quel che si può aggiungere e rifiuta il resto', () => {
    expect(isAddable('doc')).toBe(true);
    expect(isAddable('iframe')).toBe(true);
    expect(isAddable('image')).toBe(true);
    expect(isAddable('audio')).toBe(false);
  });

  it('sa dire quali fra questi sono nodi che producono, e quali no', () => {
    // È la domanda che chi crea la tile deve porsi: `newGenNodeAt` o un costruttore nato pieno.
    expect(isGenAddable('image')).toBe(true);
    expect(isGenAddable('iframe')).toBe(false);
    expect(isGenAddable('doc')).toBe(false);
  });
});
