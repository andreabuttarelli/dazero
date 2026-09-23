import { describe, expect, it } from 'vitest';
import { estimateLoopCredits } from './loop-cost';

describe('estimateLoopCredits — il preventivo prima di girare', () => {
  it('un\'immagine per iterazione: N × il prezzo di un\'immagine', () => {
    const out = estimateLoopCredits({ medium: 'image', model: null, count: 10 });
    expect(out.perRun).toBeGreaterThan(0);
    expect(out.total).toBe(out.perRun * 10);
  });

  it('un video per iterazione: N × il prezzo del MODELLO scelto, non una media', () => {
    const cheap = estimateLoopCredits({ medium: 'video', model: 'grok-imagine-video-1-5', count: 5 });
    const pricey = estimateLoopCredits({ medium: 'video', model: 'bytedance/seedance-2-5', count: 5 });
    expect(pricey.perRun).toBeGreaterThan(cheap.perRun);
    expect(pricey.total).toBe(pricey.perRun * 5);
  });

  it('zero iterazioni: zero crediti, non un errore', () => {
    const out = estimateLoopCredits({ medium: 'image', model: null, count: 0 });
    expect(out.total).toBe(0);
  });

  it('un testo per iterazione: N × il prezzo di una generazione testo', () => {
    const out = estimateLoopCredits({ medium: 'text', model: null, count: 4 });
    expect(out.total).toBe(out.perRun * 4);
  });
});
