import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateBrandImages = vi.fn();
const generateBrandVideo = vi.fn();

vi.mock('./media-generate', () => ({
  generateBrandImages: (...a: unknown[]) => generateBrandImages(...a),
  generateBrandVideo: (...a: unknown[]) => generateBrandVideo(...a)
}));

const { runGenNode } = await import('./canvas-generate');

const input = {
  brandId: 'b1',
  userId: 'u1',
  medium: 'image' as const,
  prompt: 'un gatto',
  model: 'm1',
  params: { aspectRatio: '1:1' as const }
};

beforeEach(() => {
  generateBrandImages.mockReset();
  generateBrandVideo.mockReset();
  generateBrandImages.mockResolvedValue({ ok: true, media: [{ id: 'media-1' }], model: 'm1', renders: 1, costUsd: 0.04 });
  generateBrandVideo.mockResolvedValue({ ok: true, status: 'rendering', media: [], jobId: 'job-1', model: 'v1', renders: 0, durationSeconds: 5 });
});

describe('far girare un nodo', () => {
  it('manda un immagine al motore delle immagini, UNA SOLA', async () => {
    // Il nodo mostra un risultato solo: chiederne tre pagherebbe tre render per poi buttarne due.
    await runGenNode({} as never, input);

    expect(generateBrandImages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ brandId: 'b1', prompt: 'un gatto', model: 'm1', count: 1, aspectRatio: '1:1' })
    );
    expect(generateBrandVideo).not.toHaveBeenCalled();
  });

  it('restituisce l asset appena disegnato', async () => {
    expect(await runGenNode({} as never, input)).toEqual({
      ok: true,
      mediaId: 'media-1',
      model: 'm1',
      jobId: null
    });
  });

  it('manda un video al motore dei video, con la sua durata', async () => {
    const out = await runGenNode({} as never, {
      ...input,
      medium: 'video',
      params: { aspectRatio: '9:16', duration: 5 }
    });

    expect(generateBrandVideo).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'video', durationSeconds: 5, aspectRatio: '9:16' })
    );
    expect(out).toEqual({ ok: true, mediaId: null, model: 'v1', jobId: 'job-1' });
  });

  it('un clip torna SENZA asset: atterra minuti dopo, e dirlo pronto sarebbe una bugia', async () => {
    const out = await runGenNode({} as never, { ...input, medium: 'video' });

    expect(out).toMatchObject({ ok: true, mediaId: null, jobId: 'job-1' });
  });

  it('il testo non tocca nessun motore: non ha dove atterrare', async () => {
    const out = await runGenNode({} as never, { ...input, medium: 'text' });

    expect(out).toEqual({ ok: false, error: 'medium_not_runnable' });
    expect(generateBrandImages).not.toHaveBeenCalled();
    expect(generateBrandVideo).not.toHaveBeenCalled();
  });

  it('senza modello non parte: sceglierlo noi spenderebbe su una decisione non presa', async () => {
    const out = await runGenNode({} as never, { ...input, model: null });

    expect(out).toEqual({ ok: false, error: 'model_required' });
    expect(generateBrandImages).not.toHaveBeenCalled();
  });

  it('senza prompt non parte', async () => {
    expect(await runGenNode({} as never, { ...input, prompt: '  ' })).toEqual({
      ok: false,
      error: 'prompt_required'
    });
  });

  it('il rifiuto del motore risale com è: schiacciarlo nasconde se valga la pena riprovare', async () => {
    generateBrandImages.mockResolvedValue({ ok: false, error: 'render_failed' });

    expect(await runGenNode({} as never, input)).toEqual({ ok: false, error: 'render_failed' });
  });

  it('un disegno riuscito ma senza riga di libreria non si spaccia per fatto', async () => {
    // Succede: il render atterra e l archiviazione fallisce. Senza questo ramo il nodo scriverebbe
    // una storia con `media_id` null e mostrerebbe il vuoto dicendo «Fatto».
    generateBrandImages.mockResolvedValue({ ok: true, media: [{ id: null }], model: 'm1', renders: 1, costUsd: null });

    expect(await runGenNode({} as never, input)).toEqual({ ok: false, error: 'store_failed' });
  });
});
