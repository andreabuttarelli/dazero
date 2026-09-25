import { describe, expect, it } from 'vitest';
import { creditsForRun, creditsForLoop } from './gen-cost';
import type { ModelChoice } from './gen-node';

const imageChoice: ModelChoice = {
  id: 'img-1',
  label: 'Image model',
  aspectRatios: ['1:1'],
  provider: 'x',
  providerLabel: 'X',
  unitCredits: 14
};

const videoChoice: ModelChoice = {
  id: 'vid-1',
  label: 'Video model',
  aspectRatios: ['16:9'],
  provider: 'x',
  providerLabel: 'X',
  minDuration: 4,
  maxDuration: 30,
  unitCredits: 40
};

const unpricedChoice: ModelChoice = {
  id: 'mystery',
  label: 'Mystery model',
  aspectRatios: ['1:1'],
  provider: 'x',
  providerLabel: 'X'
};

describe('creditsForRun — un giro solo', () => {
  it("un'immagine costa il prezzo unitario del modello, params a parte", () => {
    const out = creditsForRun({ medium: 'image', model: imageChoice, params: {} });
    expect(out).toBe(14);
  });

  it('un video alla durata minima costa il prezzo misurato, invariato', () => {
    const out = creditsForRun({ medium: 'video', model: videoChoice, params: { duration: 4 } });
    expect(out).toBe(40);
  });

  it('un video più lungo della durata minima costa proporzionalmente di più', () => {
    const out = creditsForRun({ medium: 'video', model: videoChoice, params: { duration: 8 } });
    expect(out).toBe(80);
  });

  it('un video senza durata nei params usa il prezzo misurato, mai un numero inventato', () => {
    const out = creditsForRun({ medium: 'video', model: videoChoice, params: {} });
    expect(out).toBe(40);
  });

  it('720p costa il doppio di 480p, alla stessa durata', () => {
    const out480 = creditsForRun({ medium: 'video', model: videoChoice, params: { duration: 4, resolution: '480p' } });
    const out720 = creditsForRun({ medium: 'video', model: videoChoice, params: { duration: 4, resolution: '720p' } });
    expect(out480).toBe(40);
    expect(out720).toBe(80);
  });

  it('durata e risoluzione insieme si moltiplicano', () => {
    const out = creditsForRun({ medium: 'video', model: videoChoice, params: { duration: 8, resolution: '720p' } });
    expect(out).toBe(160);
  });

  it('nessuna risoluzione nei params: il moltiplicatore di 480p, che è 1×', () => {
    const out = creditsForRun({ medium: 'video', model: videoChoice, params: { duration: 4 } });
    expect(out).toBe(40);
  });

  it('un modello senza unitCredits: nessun numero, mai uno sbagliato', () => {
    expect(creditsForRun({ medium: 'image', model: unpricedChoice, params: {} })).toBeNull();
    expect(creditsForRun({ medium: 'video', model: unpricedChoice, params: { duration: 8 } })).toBeNull();
  });

  it('nessun modello scelto: nessun numero', () => {
    expect(creditsForRun({ medium: 'image', model: null, params: {} })).toBeNull();
  });

  it('una risoluzione senza moltiplicatore misurato (1080p) non inventa un numero — regressione cb1de6e2', () => {
    const out = creditsForRun({ medium: 'video', model: videoChoice, params: { duration: 4, resolution: '1080p' } });
    expect(out).toBeNull();
  });
});

describe('creditsForLoop — N giri identici', () => {
  it('moltiplica il prezzo di un giro per il numero di combinazioni', () => {
    const out = creditsForLoop({ medium: 'image', model: imageChoice, params: {} }, 3);
    expect(out).toBe(42);
  });

  it('prezzo ignoto: il totale del loop resta ignoto, mai una somma sbagliata', () => {
    expect(creditsForLoop({ medium: 'image', model: unpricedChoice, params: {} }, 5)).toBeNull();
  });
});
