import { describe, it, expect } from 'vitest';
import { PHOTO_MODES, photoModeSpec, type PhotoModeId } from './photo-modes';
import { PHOTO_CRAFT_SPECS } from './photo-craft';

describe('le modalità di scatto', () => {
  it('ognuna dice quando si usa, cosa entra in campo e cosa la rompe', () => {
    for (const mode of PHOTO_MODES) {
      expect(mode.useWhen.length).toBeGreaterThan(20);
      expect(mode.inFrame.length).toBeGreaterThan(10);
      expect(mode.avoid.length).toBeGreaterThan(20);
    }
  });

  it("l'ordine dei campi è specifico della modalità, non un ordine solo per tutte", () => {
    const orders = PHOTO_MODES.map((m) => m.fields.join('>'));

    expect(new Set(orders).size).toBe(orders.length);
  });

  it('un flat-lay guarda dall alto e un hero no: il primo campo lo dice', () => {
    expect(photoModeSpec('flat-lay')).toMatch(/overhead|straight down/i);
    expect(photoModeSpec('hero')).not.toMatch(/straight down/i);
  });

  it('nessuna modalità ripete il mestiere: quello sta già nel pavimento', () => {
    for (const mode of PHOTO_MODES) {
      const spec = photoModeSpec(mode.id);
      expect(spec).not.toContain('contact shadow');
      expect(spec.length).toBeLessThan(PHOTO_CRAFT_SPECS.length);
    }
  });

  it('una modalità che non esiste non inventa un blocco', () => {
    expect(photoModeSpec('non-esiste' as PhotoModeId)).toBe('');
  });

  it('gli id sono quelli che un agente scrive, non frasi', () => {
    for (const mode of PHOTO_MODES) {
      expect(mode.id).toMatch(/^[a-z][a-z-]*$/);
    }
  });
});
