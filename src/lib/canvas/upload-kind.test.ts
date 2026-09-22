import { describe, expect, it } from 'vitest';
import { uploadKindOf, verdictForUpload, UPLOAD_MAX_BYTES, canvasUploadPrefix } from './upload-kind';

describe('che cosa diventa un file caricato', () => {
  it('un\'immagine nota diventa un\'immagine statica', () => {
    expect(uploadKindOf('image/png', 'foto.png')).toBe('image');
    expect(uploadKindOf('image/jpeg', 'foto.jpg')).toBe('image');
  });

  it('un video noto diventa un video statico', () => {
    expect(uploadKindOf('video/mp4', 'clip.mp4')).toBe('video');
    expect(uploadKindOf('video/quicktime', 'clip.mov')).toBe('video');
  });

  it('un documento convertibile diventa un documento', () => {
    expect(uploadKindOf('application/pdf', 'note.pdf')).toBe('document');
    expect(uploadKindOf('text/plain', 'note.txt')).toBe('document');
  });

  it('un formato ignoto non è nessuno dei tre', () => {
    expect(uploadKindOf('application/x-msdownload', 'virus.exe')).toBeNull();
    expect(uploadKindOf('text/html', 'page.html')).toBe('document');
  });
});

describe('il verdetto su un upload', () => {
  it('accetta un\'immagine sotto il suo tetto', () => {
    const verdict = verdictForUpload('image/png', 'foto.png', 1024);
    expect(verdict).toEqual({ ok: true, kind: 'image' });
  });

  it('rifiuta un file vuoto prima di guardare il tipo', () => {
    expect(verdictForUpload('image/png', 'foto.png', 0)).toMatchObject({ ok: false });
  });

  it('rifiuta un formato che non sa diventare niente', () => {
    const verdict = verdictForUpload('application/x-msdownload', 'virus.exe', 10);
    expect(verdict.ok).toBe(false);
  });

  it('rifiuta un\'immagine sopra il tetto del corpo di un\'azione', () => {
    const verdict = verdictForUpload('image/png', 'foto.png', UPLOAD_MAX_BYTES.image + 1);
    expect(verdict).toMatchObject({ ok: false });
  });

  it('accetta un video ben oltre il tetto di un\'immagine: va in Storage, non nel corpo', () => {
    const verdict = verdictForUpload('video/mp4', 'clip.mp4', UPLOAD_MAX_BYTES.image + 1);
    expect(verdict).toEqual({ ok: true, kind: 'video' });
  });

  it('rifiuta un video sopra il suo stesso tetto', () => {
    const verdict = verdictForUpload('video/mp4', 'clip.mp4', UPLOAD_MAX_BYTES.video + 1);
    expect(verdict).toMatchObject({ ok: false });
  });
});

describe('la cartella che la RLS di canvas-assets autorizza', () => {
  it('è org/progetto, con la barra finale', () => {
    expect(canvasUploadPrefix('org-1', 'proj-1')).toBe('org-1/proj-1/');
  });
});
