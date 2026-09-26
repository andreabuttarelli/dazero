import { describe, expect, it } from 'vitest';
import { composePrompt } from './compose-prompt';

describe('il testo collegato arriva al modello come materiale, non come parole dell\'utente', () => {
  it('in un nodo testo il documento è racchiuso e separato dalla richiesta', () => {
    const prompt = composePrompt('text', ['# Ciao'], 'cosa leggi?');
    expect(prompt).toContain('<material index="1">\n# Ciao\n</material>');
    expect(prompt.indexOf('</material>')).toBeLessThan(prompt.indexOf('cosa leggi?'));
  });

  it('senza richiesta propria il nodo testo lavora sul materiale', () => {
    expect(composePrompt('text', ['a'], '')).toContain('<material index="1">');
  });

  it('senza materiale il prompt resta quello scritto', () => {
    expect(composePrompt('text', [], 'ciao')).toBe('ciao');
  });

  it('in immagine e video il testo collegato È il prompt, unito senza cornici', () => {
    expect(composePrompt('image', ['un gatto'], 'arancione')).toBe('un gatto\n\narancione');
    expect(composePrompt('video', ['un gatto'], '')).toBe('un gatto');
  });
});
