import { describe, it, expect } from 'vitest';
import { GAP, packTiles, type Sized } from './layout';

const box = (id: string, w: number, h: number): Sized => ({ id, w, h });

/** Due riquadri si toccano? È la domanda che il layout deve rendere sempre falsa. */
function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('packTiles — nessuna tile nasce sopra un altra', () => {
  it('riquadri di misure diverse non si sovrappongono mai', () => {
    const placed = packTiles([
      box('a', 300, 300),
      box('b', 340, 200),
      box('c', 340, 180),
      box('d', 300, 300),
      box('e', 340, 200),
      box('f', 300, 300),
      box('g', 340, 180),
      box('h', 300, 300)
    ]);

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j]), `${placed[i].id} tocca ${placed[j].id}`).toBe(false);
      }
    }
  });

  // Il difetto da cui si parte: tile troppo vicine, che a colpo d'occhio sembrano un blocco solo.
  it('lascia sempre aria fra una tile e la successiva', () => {
    const [a, b] = packTiles([box('a', 300, 300), box('b', 300, 300)]);

    expect(b.x - (a.x + a.w)).toBeGreaterThanOrEqual(GAP);
  });

  it('manda a capo quando la colonna finisce, senza lasciare buchi verticali', () => {
    const placed = packTiles([box('a', 300, 300), box('b', 300, 300), box('c', 300, 300)], { columns: 2 });

    expect(placed[2].y).toBeGreaterThan(placed[0].y);
    expect(placed[2].x).toBe(placed[0].x);
  });

  // Una colonna di tile basse non deve restare indietro mentre le altre scendono: è il motivo per
  // cui si impila per colonna più corta invece che per righe fisse.
  it('una tile va nella colonna più corta, così la bacheca resta compatta', () => {
    const placed = packTiles(
      [box('alta', 300, 400), box('bassa', 300, 120), box('terza', 300, 120)],
      { columns: 2 }
    );

    expect(placed[2].x).toBe(placed[1].x);
    expect(placed[2].y).toBe(placed[1].y + 120 + GAP);
  });

  it('un elenco vuoto non esplode', () => {
    expect(packTiles([])).toEqual([]);
  });

  it('conserva id e misure: dispone soltanto', () => {
    const [only] = packTiles([box('x', 123, 45)]);

    expect(only).toMatchObject({ id: 'x', w: 123, h: 45, x: 0, y: 0 });
  });
});
