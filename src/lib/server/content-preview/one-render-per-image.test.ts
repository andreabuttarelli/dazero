import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * UN'IMMAGINE = UN RENDER FATTURATO.
 *
 * Il controllo qualita' rendeva due candidati in parallelo e ne buttava uno — gia' pagato — e poi
 * ridisegnava a prezzo pieno fino a due volte un render RIUSCITO che il critico bocciava. Misurato:
 * ~4 render pagati per ogni immagine consegnata, 1.058 render per ~250 artefatti in 30 giorni,
 * $78,29. `IMAGE_CREDITS` ha sempre dichiarato UN render.
 *
 * Il test conta i RENDER, non le immagini restituite: contare le immagini e' esattamente la
 * confusione che ha prodotto il difetto — ne tornava sempre una, e intanto se ne pagavano quattro.
 *
 * Si conta sul percorso VERO. Prima questo file finreva `route` a `{ endpoint: 'google' }` e
 * contava le chiamate a `googleGenaiClient`: un endpoint che il registro non sa produrre, cioe' il
 * conteggio girava su un ramo che la produzione non poteva raggiungere. Passava, e non misurava
 * niente.
 */

vi.mock('$lib/server/wall-digest', () => ({
  designWallDigestSection: () => Promise.resolve('')
}));

const renderImage = vi.fn();

// I due trasporti OpenRouter, entrambi: il bivio si sceglie sul MODELLO — l'API immagini per chi
// vive li', la via Gemini per gli altri — e un test che ne finge uno solo misura il prompt del ramo
// che non e' stato preso. Qui interessa cosa arriva al modello, non da quale porta passa.
vi.mock('$lib/server/openrouter-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/openrouter-image')>()),
  generateImageOnOpenrouter: renderImage
}));

vi.mock('$lib/server/openrouter-images-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/openrouter-images-api')>()),
  generateImageOnOpenrouterImages: renderImage
}));

vi.mock('$lib/server/model-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/model-routing')>()),
  route: () => ({ family: 'nano-banana', endpoint: 'openrouter', provider: 'openrouter' })
}));

const images = await import('./images');

const RENDERED = 'data:image/png;base64,AAAA';

beforeEach(() => {
  renderImage.mockReset();
  renderImage.mockResolvedValue(RENDERED);
});

describe('un render per immagine', () => {
  it('paga UN render, non due candidati piu due ritentativi', async () => {
    const out = await images.renderBrandImage('un banco di lavoro in noce', {
      visualStyle: 'warm editorial'
    });

    expect(out).toBeTruthy();
    // Il numero che conta. Con il critico erano 2 in parallelo, e fino a 4 col ritentativo.
    expect(renderImage).toHaveBeenCalledTimes(1);
  });

  it('il critico non e piu raggiungibile da nessuna parte', () => {
    expect('renderWithQC' in images).toBe(false);
    expect('critiqueImage' in images).toBe(false);
    expect('MAX_QC_RETRIES' in images).toBe(false);
  });

  // Il ritentativo di kie non ha piu' soggetto: quel trasporto restituiva un SUCCESSO vuoto, e
  // riprovare era l'unico modo di accorgersene. OpenRouter alza l'eccezione quando non c'e'
  // un'immagine nella risposta (`openrouter-image.ts`), quindi un render fallito si presenta come
  // un errore diagnosticato e non come un vuoto da indovinare. Un giro solo, e l'errore passa.
  it('un render fallito alza l’errore invece di riprovare alla cieca', async () => {
    renderImage.mockRejectedValueOnce(new Error('OpenRouter (nessuna immagine nella risposta)'));

    await expect(images.renderBrandImage('x', {})).rejects.toThrow(/nessuna immagine/);

    expect(renderImage).toHaveBeenCalledTimes(1);
  });
});
