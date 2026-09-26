import { describe, expect, it } from 'vitest';
import { isUploadedNodeRow, uploadedNodeOf } from './uploaded-node';

describe('un\'immagine o un video caricati, non generati', () => {
  it('un nodo `image` con `assetId` è un caricamento statico', () => {
    expect(isUploadedNodeRow({ type: 'image', data: { assetId: 'a1' } })).toBe(true);
  });

  it('un nodo `video` con `assetId` è un caricamento statico', () => {
    expect(isUploadedNodeRow({ type: 'video', data: { assetId: 'a1' } })).toBe(true);
  });

  it('un nodo `image` generato, senza `assetId`, non lo è — anche con un prompt vuoto', () => {
    expect(isUploadedNodeRow({ type: 'image', data: { prompt: '' } })).toBe(false);
  });

  it('un nodo di un altro tipo non lo è mai', () => {
    expect(isUploadedNodeRow({ type: 'doc', data: { assetId: 'a1' } })).toBe(false);
  });

  it('legge nome, url e mime dalla riga', () => {
    const node = uploadedNodeOf({ id: 'n1', data: { assetId: 'a1', url: '/x', name: 'foto.png', mimeType: 'image/png' } });
    expect(node).toEqual({ id: 'n1', assetId: 'a1', url: '/x', name: 'foto.png', mimeType: 'image/png' });
  });

  it('torna null senza un `assetId`', () => {
    expect(uploadedNodeOf({ id: 'n1', data: {} })).toBeNull();
  });
});
