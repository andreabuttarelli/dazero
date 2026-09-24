import { describe, expect, it } from 'vitest';
import { syncNodes } from './tile-sync';

const tile = (id: string) => ({ id, x: 0, y: 0, w: 10, h: 10 });
const node = (id: string) => ({ id, position: { x: 0, y: 0 }, data: {}, type: 'tile' });

/** Come `CanvasFlow` costruisce un nodo da una tile, ridotto a quel che serve qui. */
const toNode = (t: { id: string }) => node(t.id);

describe('tenere i nodi della tela allineati alle tile', () => {
  it('porta dentro quelle nuove', () => {
    const out = syncNodes([node('a')], [tile('a'), tile('b')], toNode);

    expect(out?.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('TOGLIE quelle sparite, o restano a galleggiare', () => {
    // Il difetto vero: un nodo creato prende un id provvisorio e lo cambia con quello del
    // database appena la riga esiste. Senza rimozione, il vecchio resta sulla tela e nella
    // minimappa — un fantasma che si sposta da solo perché nessuno lo sta più aggiornando.
    const out = syncNodes([node('provvisorio'), node('b')], [tile('vero'), tile('b')], toNode);

    expect(out?.map((n) => n.id).sort()).toEqual(['b', 'vero']);
  });

  it('non tocca niente quando nulla è cambiato', () => {
    // Restituire un array nuovo a ogni giro farebbe ridisegnare la tela di continuo, e un
    // trascinamento in corso verrebbe buttato via a ogni battito.
    expect(syncNodes([node('a')], [tile('a')], toNode)).toBeNull();
  });

  it('conserva il nodo che SvelteFlow sta già muovendo, non lo ricostruisce', () => {
    const moving = { ...node('a'), position: { x: 999, y: 999 } };

    const out = syncNodes([moving], [tile('a'), tile('b')], toNode);

    expect(out?.find((n) => n.id === 'a')?.position).toEqual({ x: 999, y: 999 });
  });

  it('un nodo che resta prende comunque lo STILE nuovo della sua tile — un testo che cresce cambia altezza, non dati', () => {
    const stale = { ...node('a'), style: 'width:360px;height:220px' };
    const grownTile = { ...tile('a'), w: 360, h: 320 };
    const toNodeWithStyle = (t: { id: string; w: number; h: number }) => ({
      ...node(t.id),
      style: `width:${t.w}px;height:${t.h}px`
    });

    const out = syncNodes([stale], [grownTile], toNodeWithStyle);

    expect(out?.find((n) => n.id === 'a')?.style).toBe('width:360px;height:320px');
  });

  it('un nodo che resta prende comunque i dati NUOVI della sua tile — il modello scelto cambia le porte', () => {
    const stale = { ...node('a'), data: { connectors: ['text'] } };
    const freshTile = { ...tile('a'), connectors: ['text', 'images'] };
    const toNodeWithData = (t: { id: string; connectors?: string[] }) => ({
      ...node(t.id),
      data: { connectors: t.connectors }
    });

    const out = syncNodes([stale], [freshTile], toNodeWithData);

    expect(out?.find((n) => n.id === 'a')?.data).toEqual({ connectors: ['text', 'images'] });
  });

  it('un nodo nuovo che chiede la selezione arriva selezionato', () => {
    const toNodeSelectable = (t: { id: string; select?: boolean }) => ({ ...node(t.id), selected: t.select === true });

    const out = syncNodes([], [{ ...tile('a'), select: true }], toNodeSelectable);

    expect(out?.find((n) => n.id === 'a')?.selected).toBe(true);
  });

  it('un nodo nuovo selezionato toglie la selezione da quelli già sulla tela', () => {
    const toNodeSelectable = (t: { id: string; select?: boolean }) => ({ ...node(t.id), selected: t.select === true });
    const alreadySelected = { ...node('old'), selected: true };

    const out = syncNodes([alreadySelected], [tile('old'), { ...tile('new'), select: true }], toNodeSelectable);

    expect(out?.find((n) => n.id === 'old')?.selected).toBe(false);
    expect(out?.find((n) => n.id === 'new')?.selected).toBe(true);
  });

  it('un inserimento realtime senza selezione non tocca chi era già selezionato', () => {
    const toNodeSelectable = (t: { id: string; select?: boolean }) => ({ ...node(t.id), selected: t.select === true });
    const alreadySelected = { ...node('old'), selected: true };

    const out = syncNodes([alreadySelected], [tile('old'), tile('fromPeer')], toNodeSelectable);

    expect(out?.find((n) => n.id === 'old')?.selected).toBe(true);
  });
});
