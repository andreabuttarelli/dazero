import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Il video senza brand: chi paga, che cosa non esiste (la libreria), e come si nomina una sorgente
 * quando una libreria non c'è.
 *
 * Il negativo che conta resta la lettura di `brands`: se questo percorso la tocca ancora, è ancora
 * ancorato a un brand e l'opzionale è finto.
 */

const renderPostImage = vi.fn();
const insertBrandMedia = vi.fn();
const storeBrandMediaBytes = vi.fn();
const signKnowledgePaths = vi.fn();
const withBrandContext = vi.fn();
const withOrgContext = vi.fn();
const submitAndTrackVideoRender = vi.fn();
const countOutstandingVideoRenders = vi.fn();
const imagePartFor = vi.fn();
const transformVideo = vi.fn();
const persistExternalVideo = vi.fn();
const remaining = vi.fn();

const PNG_DATA_URL = 'data:image/png;base64,AAAA';
const SIGNED = 'https://storage.test/signed?token=abc';

vi.mock('$lib/server/media-generate.images', () => ({
  renderPostImage: (...args: unknown[]) => renderPostImage(...args),
  buildImageRequest: (_prompt: string, opts: { model?: string }) => ({ model: opts.model ?? null }),
  loadBrandVisualContext: vi.fn()
}));
vi.mock('$lib/server/brand-media', () => ({
  loadLibraryMediaParts: async () => [],
  insertBrandMedia: (...args: unknown[]) => insertBrandMedia(...args),
  storeBrandMediaBytes: (...args: unknown[]) => storeBrandMediaBytes(...args),
  probeImageDimensions: async () => ({ width: 1080, height: 1080 }),
  resolveBrandImageIds: async () => [],
  saveRenderedVideoToLibrary: vi.fn()
}));
vi.mock('$lib/server/brand-context', () => ({
  imagePartFor: (...args: unknown[]) => imagePartFor(...args)
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
  withBrandContext: <T>(brandId: string, fn: () => T) => {
    withBrandContext(brandId);
    return fn();
  },
  withOrgContext: <T>(orgId: string, fn: () => T) => {
    withOrgContext(orgId);
    return fn();
  }
}));
vi.mock('$lib/server/video-render-queue', () => ({
  submitAndTrackVideoRender: (...args: unknown[]) => submitAndTrackVideoRender(...args),
  countOutstandingVideoRenders: (...args: unknown[]) => countOutstandingVideoRenders(...args)
}));
vi.mock('$lib/server/video', () => ({
  transformVideo: (...args: unknown[]) => transformVideo(...args),
  persistExternalVideo: (...args: unknown[]) => persistExternalVideo(...args),
  resolveVideoModel: () => 'bytedance/seedance-2-5',
  clampVideoDuration: (d: number) => d
}));
vi.mock('$lib/server/usage', () => ({ remaining: (...args: unknown[]) => remaining(...args) }));
vi.mock('$lib/server/supabase-admin', () => ({ createAdminClient: () => adminClient }));

import { generateVideoWithoutBrand } from './media-generate';

/** Legge `brands`: qui è un fallimento, non un dato. Un percorso senza brand non deve arrivarci. */
function noBrands() {
  return {
    from: (table: string) => {
      if (table === 'brands' || table === 'brand_kit' || table === 'brand_media') {
        throw new Error(`ha letto ${table}`);
      }
      throw new Error(`ha letto ${table}`);
    }
  } as never;
}

/** L'admin del percorso video: legge la coda, e su ogni tabella di brand fallisce apposta. */
function adminForVideo() {
  return {
    from: (table: string) => {
      if (table !== 'video_renders') throw new Error(`ha letto ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'job-1' }, error: null }) }) })
      };
    }
  } as never;
}

let adminClient: unknown = adminForVideo();

const ORG = 'org-1';
const USER = 'user-1';
const OWN_IMAGE = `${USER}/media/generated-a1.png`;
const SOMEONE_ELSE = 'user-2/media/generated-a1.png';

beforeEach(() => {
  vi.clearAllMocks();
  adminClient = adminForVideo();
  renderPostImage.mockResolvedValue(PNG_DATA_URL);
  storeBrandMediaBytes.mockResolvedValue({});
  signKnowledgePaths.mockImplementation(
    async (_c: unknown, paths: string[]) => new Map(paths.map((p) => [p, SIGNED]))
  );
  imagePartFor.mockResolvedValue({ ok: true, part: { inlineData: { mimeType: 'image/png', data: 'AAAA' } } });
  submitAndTrackVideoRender.mockResolvedValue({
    taskId: 'job-1',
    model: 'bytedance/seedance-2-5',
    durationSeconds: 8
  });
  countOutstandingVideoRenders.mockResolvedValue(0);
  remaining.mockResolvedValue({ videos: 10 });
});

describe('un video senza brand', () => {
  const job = { orgId: ORG, userId: USER, prompt: 'un gatto che salta' };

  it('non legge la tabella dei brand', async () => {
    const out = await generateVideoWithoutBrand(job);

    expect(out.ok).toBe(true);
  });

  it('addebita all organizzazione, che è chi paga quando nessun brand paga', async () => {
    await generateVideoWithoutBrand(job);

    expect(withOrgContext).toHaveBeenCalledWith(ORG);
    expect(withBrandContext).not.toHaveBeenCalled();
  });

  /** La riga della coda porta il padrone addosso: è l'unica cosa che il cron avrà in mano. */
  it('scrive l organizzazione sulla riga della coda, e nessun brand', async () => {
    await generateVideoWithoutBrand(job);

    expect(submitAndTrackVideoRender).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: null, orgId: ORG })
    );
  });

  /** L'allocazione mensile è del piano di un brand: qui non c'è un piano da interrogare. */
  it('non interroga l allocazione mensile di nessuno', async () => {
    await generateVideoWithoutBrand(job);

    expect(remaining).not.toHaveBeenCalled();
    expect(countOutstandingVideoRenders).not.toHaveBeenCalled();
  });

  it('anima il percorso che il generatore senza brand ha consegnato', async () => {
    await generateVideoWithoutBrand({ ...job, baseMediaId: OWN_IMAGE });

    expect(submitAndTrackVideoRender).toHaveBeenCalledWith(
      expect.objectContaining({ render: expect.objectContaining({ imageUrl: SIGNED }) })
    );
  });

  /**
   * Il primo segmento del percorso è lo user, ed è la stessa cosa che guarda la policy dello
   * storage. Il percorso di un altro non risolve — esattamente come l'id di un altro inquilino non
   * risolve sotto il brand. Fermarsi qui è il punto: filmare da zero chi ha chiesto di animare la
   * SUA foto è il difetto travestito da rimedio.
   */
  it('il percorso di un altro utente non risolve, e il render non parte', async () => {
    const out = await generateVideoWithoutBrand({ ...job, baseMediaId: SOMEONE_ELSE });

    expect(out).toMatchObject({ ok: false, error: 'source_not_found' });
    expect(submitAndTrackVideoRender).not.toHaveBeenCalled();
  });

  it('un indirizzo scelto da chi chiama non è una sorgente', async () => {
    const out = await generateVideoWithoutBrand({ ...job, baseMediaId: 'https://evil.test/a.png' });

    expect(out).toMatchObject({ ok: false, error: 'source_not_found' });
    expect(submitAndTrackVideoRender).not.toHaveBeenCalled();
  });

  it('torna un job da seguire, perché un clip non è mai pronto subito', async () => {
    const out = await generateVideoWithoutBrand(job);

    expect(out.ok && out.status).toBe('rendering');
    expect(out.ok && out.jobId).toBeTruthy();
  });
});
