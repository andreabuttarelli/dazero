import { describe, it, expect } from 'vitest';
import { buildImageRequest } from './media-generate.images';

/**
 * `resolution` è un fatto della SCELTA (`RenderImageOpts`, dal nodo tela), non del prompt: deve
 * atterrare in `config.imageConfig.resolution`, lo stesso posto in cui `aspectRatio` atterra già,
 * perché è di lì che `generateImageOnOpenrouterImages` lo legge per mandarlo sul filo.
 */
describe('buildImageRequest — la risoluzione scelta', () => {
  it('finisce in config.imageConfig.resolution quando è passata', () => {
    const req = buildImageRequest('una tazza', { resolution: '2K' });
    expect(req.config.imageConfig.resolution).toBe('2K');
  });

  it('assente quando non è stata scelta: nessun default inventato', () => {
    const req = buildImageRequest('una tazza');
    expect(req.config.imageConfig.resolution).toBeUndefined();
  });
});
