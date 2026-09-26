import { describe, expect, it } from 'vitest';
import { colourSwatchPath, colourSwatchUrl } from './brand-colour-asset';

const ORG = '11111111-1111-1111-1111-111111111111';

describe('colourSwatchPath: dove vive lo swatch di un colore nel bucket media', () => {
  it('un percorso per org e colore, senza # nel nome del file', () => {
    expect(colourSwatchPath(ORG, '#1a2b3c')).toBe(`colours/${ORG}/1a2b3c.png`);
  });

  it('lo stesso colore, lo stesso percorso — idempotente per costruzione', () => {
    expect(colourSwatchPath(ORG, '#1a2b3c')).toBe(colourSwatchPath(ORG, '#1a2b3c'));
  });

  it('un colore rgb(...) diventa un nome file senza caratteri illegali', () => {
    expect(colourSwatchPath(ORG, 'rgb(255, 0, 128)')).toBe(`colours/${ORG}/rgb-255-0-128.png`);
  });
});

describe('colourSwatchUrl: l\'url pubblico che il chip trascina', () => {
  it('compone origin del bucket e percorso', () => {
    expect(colourSwatchUrl('https://x.supabase.co/storage/v1/object/public/media/', ORG, '#1a2b3c')).toBe(
      `https://x.supabase.co/storage/v1/object/public/media/colours/${ORG}/1a2b3c.png`
    );
  });
});
