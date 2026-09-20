import { describe, it, expect } from 'vitest';
import { UGC_CRAFT_SPECS } from './ugc-craft';
import { PHOTO_CRAFT_SPECS } from './photo-craft';
import { UGC_FORMATS } from '$lib/ugc-formats';

describe('il mestiere UGC: quello che il modello video rende male', () => {
  it('il labiale è la cosa più debole: chiede la bocca chiusa mentre le mani lavorano', () => {
    expect(UGC_CRAFT_SPECS).toMatch(/mouth closed/i);
  });

  it('conta le mani, perché un terzo compito fa comparire una terza mano', () => {
    expect(UGC_CRAFT_SPECS).toMatch(/third hand/i);
    expect(UGC_CRAFT_SPECS).toMatch(/arm's length|one hand/i);
  });

  it('la performance va alzata di un gradino, perché il modello la restituisce piatta', () => {
    expect(UGC_CRAFT_SPECS).toMatch(/flatter than/i);
  });

  it('sotto la scala di un arto non rende, e lo dice con esempi', () => {
    expect(UGC_CRAFT_SPECS).toMatch(/cap|zip|clasp|drawstring/i);
  });

  it('una posizione che cambia senza un movimento visibile è un teletrasporto', () => {
    expect(UGC_CRAFT_SPECS).toMatch(/teleport/i);
  });

  it('niente si può scrivere come assente, nemmeno un suono', () => {
    expect(UGC_CRAFT_SPECS).toMatch(/absent/i);
  });

  // Il pavimento fotografico e il mestiere delle grafiche arrivano per conto loro: ripeterli qui
  // sarebbe la seconda copia che diverge alla prima modifica.
  it('non ripete il pavimento fotografico', () => {
    expect(UGC_CRAFT_SPECS).not.toMatch(/contact shadow/i);
    expect(UGC_CRAFT_SPECS.length).toBeLessThan(PHOTO_CRAFT_SPECS.length);
  });

  // Gli archi esistono già in `ugc-formats.ts`, con le battute e le percentuali: il craft dice
  // COME si rende una battuta, non QUALI battute ci sono. Due registri degli stessi archi
  // divergerebbero al primo formato nuovo.
  it('non riscrive gli archi che il prodotto ha già', () => {
    for (const format of UGC_FORMATS) {
      expect(UGC_CRAFT_SPECS).not.toContain(format.id);
    }
  });
});
