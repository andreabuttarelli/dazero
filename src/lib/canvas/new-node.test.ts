import { describe, it, expect } from 'vitest';
import { newGenNodeAt } from './new-node';

describe('un nodo creato dal doppio clic', () => {
  it('nasce dove è stato chiesto, non al centro della tela', () => {
    const tile = newGenNodeAt('image', { x: 400, y: 120 });

    // Il punto è quello della tela, non quello dello schermo: la conversione la fa chi disegna,
    // qui arriva già convertito. Centrato sul puntatore, perché è lì che si sta guardando.
    expect(tile.x).toBe(400 - tile.w / 2);
    expect(tile.y).toBe(120 - tile.h / 2);
  });

  it('prende la misura del suo medium', () => {
    expect(newGenNodeAt('text', { x: 0, y: 0 }).h).toBeLessThan(
      newGenNodeAt('video', { x: 0, y: 0 }).h
    );
  });

  it('nasce collegabile: un nodo che produce è fatto per stare in catena', () => {
    expect(newGenNodeAt('image', { x: 0, y: 0 }).connectable).not.toBe(false);
  });

  it('nasce vuoto e senza risultato', () => {
    const tile = newGenNodeAt('video', { x: 0, y: 0 });

    expect(tile.prompt).toBe('');
    expect(tile.refId).toBeNull();
    expect(tile.medium).toBe('video');
  });

  it('ogni nodo ha un id suo', () => {
    const a = newGenNodeAt('image', { x: 0, y: 0 });
    const b = newGenNodeAt('image', { x: 0, y: 0 });

    expect(a.id).not.toBe(b.id);
  });
});
