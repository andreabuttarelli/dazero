import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `model_not_for_slot` su ogni modello nuovo del catalogo (bb3b917b/1e66da9c): il canvas mandava
 * un id che il menu aveva offerto, e il cancello lo rifiutava lo stesso perché guardava lo slot a
 * ruolo (`IMAGE_MODEL_CHOICES`/`videoModelSpec(...)?.roles`), non quello che il menu offre davvero
 * (`offerableModels`). Un modello sincronizzato SENZA spec — "Google: Nano Banana (Gemini 2.5
 * Flash Image)" — non ha un ruolo da dichiarare, quindi era sempre rifiutato.
 *
 * Questo file prova che sotto il canvas (`brandId: null`) il cancello ora legge lo stesso elenco
 * del menu, e che un modello che il catalogo NON offre resta rifiutato — il cancello non sparisce,
 * cambia solo contro cosa confronta.
 */

const renderPostImage = vi.fn();
const insertBrandMedia = vi.fn();
const storeBrandMediaBytes = vi.fn();
const signKnowledgePaths = vi.fn();
const submitAndTrackVideoRender = vi.fn();
const countOutstandingVideoRenders = vi.fn();
const offerableModels = vi.fn();

const PNG_DATA_URL = 'data:image/png;base64,AAAA';
const SIGNED = 'https://storage.test/signed?token=abc';

vi.mock('$lib/server/media-generate.images', () => ({
  renderPostImage: (...args: unknown[]) => renderPostImage(...args),
  buildImageRequest: (_prompt: string, opts: { model?: string }) => ({ model: opts.model ?? null }),
  loadBrandVisualContext: vi.fn()
}));
vi.mock('$lib/server/brand-media', () => ({
  loadLibraryMediaPart: async () => ({ ok: false, reason: 'fetch_failed' }),
  insertBrandMedia: (...args: unknown[]) => insertBrandMedia(...args),
  storeBrandMediaBytes: (...args: unknown[]) => storeBrandMediaBytes(...args),
  probeImageDimensions: async () => ({ width: 1080, height: 1080 }),
  resolveBrandImageIds: async () => []
}));
vi.mock('$lib/server/media-archive', () => ({
  signKnowledgePaths: (...args: unknown[]) => signKnowledgePaths(...args)
}));
vi.mock('$lib/server/content-credentials', () => ({
  markImage: async (bytes: Buffer) => bytes,
  DIGITAL_SOURCE_TYPE: { synthetic: 'trainedAlgorithmicMedia' }
}));
vi.mock('$lib/server/ai-log', () => ({
  billedUsdInScope: () => 0.05,
  withBrandContext: <T>(_brandId: string, fn: () => T) => fn(),
  withOrgContext: <T>(_orgId: string, fn: () => T) => fn()
}));
vi.mock('$lib/server/offerable-models', () => ({
  offerableModels: (...args: unknown[]) => offerableModels(...args)
}));
const admin = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { id: 'video-render-1' }, error: null })
      })
    })
  })
};
vi.mock('$lib/server/supabase-admin', () => ({ createAdminClient: () => admin }));
vi.mock('$lib/server/video-render-queue', () => ({
  submitAndTrackVideoRender: (...a: unknown[]) => submitAndTrackVideoRender(...a),
  countOutstandingVideoRenders: (...a: unknown[]) => countOutstandingVideoRenders(...a)
}));
vi.mock('$lib/server/usage', () => ({ remaining: async () => ({ videos: 5 }) }));

import { generateImagesWithoutBrand, generateVideoWithoutBrand } from './media-generate';

const NANO_BANANA_UNSPECCED = 'google/gemini-2.5-flash-image';

beforeEach(() => {
  vi.clearAllMocks();
  renderPostImage.mockResolvedValue(PNG_DATA_URL);
  storeBrandMediaBytes.mockResolvedValue({});
  insertBrandMedia.mockResolvedValue({ row: { id: 'media-new', kind: 'image', short_code: 'K7BX2MQ4' } });
  signKnowledgePaths.mockImplementation(
    async (_c: unknown, paths: string[]) => new Map(paths.map((p) => [p, SIGNED]))
  );
  countOutstandingVideoRenders.mockResolvedValue(0);
  submitAndTrackVideoRender.mockResolvedValue({ taskId: 't1', model: NANO_BANANA_UNSPECCED });
});

describe('il canvas valida contro cio che il menu ha offerto, non contro uno slot a ruolo', () => {
  it('un modello sincronizzato senza spec nostro genera davvero, con il suo id sul filo', async () => {
    offerableModels.mockResolvedValue({ synced: true, choices: [{ id: NANO_BANANA_UNSPECCED }] });

    const out = await generateImagesWithoutBrand({} as never, {
      orgId: 'org-1',
      userId: 'user-1',
      prompt: 'un gatto',
      model: NANO_BANANA_UNSPECCED
    });

    expect(out.ok).toBe(true);
    expect(offerableModels).toHaveBeenCalledWith(admin, 'image');
    const opts = renderPostImage.mock.calls[0][1];
    expect(opts.model).toBe(NANO_BANANA_UNSPECCED);
  });

  it('un modello che il sync NON conferma resta rifiutato', async () => {
    offerableModels.mockResolvedValue({ synced: true, choices: [{ id: 'some/other-model' }] });

    const out = await generateImagesWithoutBrand({} as never, {
      orgId: 'org-1',
      userId: 'user-1',
      prompt: 'un gatto',
      model: 'un-modello-mai-sincronizzato'
    });

    expect(out).toMatchObject({ ok: false, error: 'model_not_for_slot' });
    expect(renderPostImage).not.toHaveBeenCalled();
  });

  it('stessa cosa per il video: un modello sincronizzato senza spec parte davvero', async () => {
    offerableModels.mockResolvedValue({ synced: true, choices: [{ id: NANO_BANANA_UNSPECCED }] });

    const out = await generateVideoWithoutBrand({
      orgId: 'org-1',
      userId: 'user-1',
      prompt: 'un carrello lento',
      model: NANO_BANANA_UNSPECCED
    } as never);

    expect(out.ok).toBe(true);
    expect(offerableModels).toHaveBeenCalledWith(admin, 'video');
    expect(submitAndTrackVideoRender).toHaveBeenCalled();
  });

  it('il video rifiuta un modello che il sync non conferma, senza sottometterlo al fornitore', async () => {
    offerableModels.mockResolvedValue({ synced: true, choices: [] });

    const out = await generateVideoWithoutBrand({
      orgId: 'org-1',
      userId: 'user-1',
      prompt: 'un carrello lento',
      model: 'un-modello-mai-sincronizzato'
    } as never);

    expect(out).toMatchObject({ ok: false, error: 'model_not_for_slot' });
    expect(submitAndTrackVideoRender).not.toHaveBeenCalled();
  });
});
