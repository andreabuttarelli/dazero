import { describe, it, expect } from 'vitest';
import { withRun, showRun, shownIndex, canStartRun, blockedReason, RUNNABLE_MEDIUMS } from './gen-history';
import type { GenNode, GenRun } from './gen-node';

const node = (over: Partial<GenNode> = {}): GenNode => ({
  id: 'n1',
  medium: 'image',
  model: 'm1',
  prompt: 'un gatto',
  params: {},
  refId: null,
  runs: [],
  ...over
});

const run = (over: Partial<GenRun> = {}): GenRun => ({
  id: 'r1',
  mediaId: 'media-1',
  prompt: 'un gatto',
  model: 'm1',
  createdAt: '2026-09-21T10:00:00Z',
  ...over
});

describe('la storia delle generazioni', () => {
  it('tiene la generazione di prima invece di sovrascriverla', () => {
    const first = withRun(node(), run({ id: 'r1', mediaId: 'media-1' }));
    const second = withRun(first, run({ id: 'r2', mediaId: 'media-2' }));

    expect(second.runs.map((r) => r.mediaId)).toEqual(['media-1', 'media-2']);
  });

  it('mostra sempre l ultima appena arriva: è quella che si è appena pagata', () => {
    const after = withRun(node({ refId: 'media-1' }), run({ id: 'r2', mediaId: 'media-2' }));

    expect(after.refId).toBe('media-2');
  });

  it('una esecuzione senza asset non entra nella storia', () => {
    // Un video parte e atterra minuti dopo: finché non c'è un media da rivedere, una riga in
    // striscia sarebbe una miniatura che non si può aprire.
    const after = withRun(node(), run({ mediaId: null }));

    expect(after.runs).toEqual([]);
    expect(after.refId).toBeNull();
  });

  it('non rimette in storia la stessa esecuzione arrivata due volte', () => {
    const once = withRun(node(), run());
    const twice = withRun(once, run());

    expect(twice.runs).toHaveLength(1);
  });
});

describe('tornare a una generazione di prima', () => {
  it('rimette in mostra quella scelta senza toglierla dalla storia', () => {
    const two = { ...node(), runs: [run({ id: 'r1', mediaId: 'media-1' }), run({ id: 'r2', mediaId: 'media-2' })], refId: 'media-2' };

    const back = showRun(two, 'r1');

    expect(back.refId).toBe('media-1');
    expect(back.runs).toHaveLength(2);
  });

  it('un id che non esiste lascia il nodo com era: non si svuota quel che si vede', () => {
    const one = { ...node(), runs: [run()], refId: 'media-1' };

    expect(showRun(one, 'ignoto')).toEqual(one);
  });

  it('dice quale delle esecuzioni si sta guardando', () => {
    const two = { ...node(), runs: [run({ id: 'r1', mediaId: 'media-1' }), run({ id: 'r2', mediaId: 'media-2' })], refId: 'media-1' };

    expect(shownIndex(two)).toBe(0);
  });

  it('senza niente in mostra non indica nessuna esecuzione', () => {
    expect(shownIndex(node())).toBe(-1);
  });
});

describe('il doppio clic su Genera', () => {
  it('non lancia due volte: la seconda pressione trova il nodo già in corso', () => {
    // Un giro costa crediti veri. Senza questa guardia due clic vicini pagano due render, e il
    // secondo sovrascrive il primo appena atterra.
    expect(canStartRun(node({ running: true }))).toBe(false);
  });

  it('un nodo senza prompt non parte', () => {
    expect(canStartRun(node({ prompt: '  ' }))).toBe(false);
  });

  it('un nodo senza modello non parte: sceglierlo noi spenderebbe su una decisione non presa', () => {
    expect(canStartRun(node({ model: null }))).toBe(false);
  });

  it('un nodo che ha già prodotto può rifare: è la seconda generazione, non un errore', () => {
    expect(canStartRun(node({ refId: 'media-1' }))).toBe(true);
  });

  it('pronto e con modello, parte', () => {
    expect(canStartRun(node())).toBe(true);
  });

  it('un nodo di testo parte come gli altri: il testo atterra su un asset', () => {
    expect(canStartRun(node({ medium: 'text' }))).toBe(true);
  });
});

describe('perché un nodo non parte', () => {
  it('lo dice invece di lasciare un bottone spento senza spiegazione', () => {
    // Un bottone disabilitato e muto è il difetto che l utente ha segnalato come «non funziona»:
    // non poteva distinguere «rotto» da «manca qualcosa».
    expect(blockedReason(node({ prompt: '' }))).toMatch(/cosa/i);
    expect(blockedReason(node({ model: null }))).toMatch(/modello/i);
  });

  it('per il testo senza modello dice di sceglierlo, come per gli altri', () => {
    expect(blockedReason(node({ medium: 'text', model: null, prompt: 'x' }))).toMatch(/modello/i);
  });

  it('un nodo che può partire non ha niente da spiegare', () => {
    expect(blockedReason(node())).toBeNull();
  });

  it('girano tutti e tre i medium che producono: il testo atterra su un asset', () => {
    expect(RUNNABLE_MEDIUMS).toEqual(['text', 'image', 'video']);
  });
});
