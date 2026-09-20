import { describe, it, expect, vi, beforeEach } from 'vitest';

// Il digest ambientale è SPENTO: il wall pubblico non si rigenera più e nel repo non esiste più
// nessuna funzione che lo scriva. Questo mock riproduce la produzione di oggi, non un caso limite.
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

const { PHOTO_CRAFT_SPECS } = await import('$lib/design/photo-craft');
const { buildImageRequest, renderBrandImage, renderPostImage, renderCarouselSlide } = await import('./images');

const RENDERED = 'data:image/png;base64,AAAA';
const PROMPT = 'A jar of honey on a linen cloth';
const RENDER_OPTS = { visualStyle: 'warm editorial', aspectRatio: '1:1' as const };

const promptsSentToModel = () =>
  renderImage.mock.calls.map((c) => c[0].contents[0].parts[0].text as string);

const failingStorage = {
  storage: { from: () => ({ upload: async () => ({ error: { message: 'no bucket' } }) }) }
};

/** Una riga del craft che nessun'altra parte del prompt pronuncia: se c'è, viene da lì. */
const A_CRAFT_RULE = 'contact shadow';

beforeEach(() => {
  renderImage.mockReset();
  renderImage.mockResolvedValue(RENDERED);
});

describe('il pavimento del craft non è mai vuoto', () => {
  it('buildImageRequest lo porta anche senza che il chiamante lo passi', () => {
    const text = buildImageRequest(PROMPT, RENDER_OPTS).contents[0].parts[0].text;

    expect(text).toContain(A_CRAFT_RULE);
  });

  it('renderPostImage lo porta: è il chokepoint, non solo i suoi due wrapper', async () => {
    await renderPostImage(PROMPT, RENDER_OPTS);

    expect(promptsSentToModel()[0]).toContain(A_CRAFT_RULE);
  });

  it('renderBrandImage lo porta col digest spento', async () => {
    await renderBrandImage(PROMPT, RENDER_OPTS);

    expect(promptsSentToModel()[0]).toContain(A_CRAFT_RULE);
  });

  it('renderCarouselSlide lo porta su ogni slide', async () => {
    await renderCarouselSlide(
      failingStorage as never,
      'user-1',
      'slide two: the mechanic',
      1,
      3,
      RENDER_OPTS,
      undefined,
      {}
    );

    expect(promptsSentToModel()[0]).toContain(A_CRAFT_RULE);
  });

  it('il craft sta sotto il soggetto e sopra lo stile del brand', async () => {
    await renderBrandImage(PROMPT, RENDER_OPTS);

    const text = promptsSentToModel()[0];
    expect(text.slice(0, PROMPT.length)).toBe(PROMPT);
    expect(text.indexOf(PHOTO_CRAFT_SPECS)).toBeLessThan(text.indexOf('BRAND VISUAL STYLE'));
  });

  it('una modalità di scatto entra nel prompt, e senza modalità non compare niente', () => {
    const withMode = buildImageRequest(PROMPT, { ...RENDER_OPTS, shotMode: 'flat-lay' })
      .contents[0].parts[0].text;
    const without = buildImageRequest(PROMPT, RENDER_OPTS).contents[0].parts[0].text;

    expect(withMode).toContain('SHOT MODE');
    expect(withMode).toMatch(/overhead/i);
    expect(without).not.toContain('SHOT MODE');
  });

  it('la modalità non scavalca il mestiere: arrivano tutti e due', () => {
    const text = buildImageRequest(PROMPT, { ...RENDER_OPTS, shotMode: 'hero' }).contents[0].parts[0].text;

    expect(text).toContain('SHOT MODE');
    expect(text).toContain(A_CRAFT_RULE);
  });

  // Il modello lo risolve `buildImageRequest` stessa, sopra la composizione del prompt: le note
  // del modello devono uscire da lì senza che nessun chiamante le passi.
  it('le note del modello che renderà escono dal prompt, risolte da sole', () => {
    const text = buildImageRequest(PROMPT, RENDER_OPTS).contents[0].parts[0].text;

    expect(text).toContain('MODEL NOTES');
  });

  it('un modello esplicito riceve le SUE note, non quelle del default', () => {
    const gpt = buildImageRequest(PROMPT, { ...RENDER_OPTS, model: 'gpt-image-2' })
      .contents[0].parts[0].text;
    const seedream = buildImageRequest(PROMPT, { ...RENDER_OPTS, model: 'seedream-5-pro' })
      .contents[0].parts[0].text;

    expect(gpt).toMatch(/transparent/i);
    expect(seedream).toMatch(/figure number|image 1/i);
    expect(gpt).not.toBe(seedream);
  });

  it('le note del modello non scavalcano il mestiere: arrivano tutti e due', () => {
    const text = buildImageRequest(PROMPT, { ...RENDER_OPTS, model: 'gpt-image-2' })
      .contents[0].parts[0].text;

    expect(text).toContain(A_CRAFT_RULE);
    expect(text).toContain('MODEL NOTES');
  });

  it('un craftFloor esplicito vince sul default, e non li somma', async () => {
    await renderPostImage(PROMPT, { ...RENDER_OPTS, craftFloor: '\n\nUN PAVIMENTO SU MISURA\n' });

    const text = promptsSentToModel()[0];
    expect(text).toContain('UN PAVIMENTO SU MISURA');
    expect(text).not.toContain(A_CRAFT_RULE);
  });
});
