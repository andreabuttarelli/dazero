import { describe, it, expect } from 'vitest';
import { videoCraftFor, VIDEO_CRAFT } from './video-craft';
import { GROK_IMAGINE_VIDEO_MODEL, KLING_3_VIDEO_MODEL, SEEDANCE_25_MODEL } from '$lib/video-models';

describe('il craft video è per modello, perché i modelli sbagliano cose diverse', () => {
  it('ogni voce dichiara il modello a cui si riferisce', () => {
    for (const entry of VIDEO_CRAFT) {
      expect(entry.models.length).toBeGreaterThan(0);
      expect(entry.text.length).toBeGreaterThan(100);
    }
  });

  it('nessun modello compare in due voci: due regole per lo stesso modello divergono', () => {
    const seen = VIDEO_CRAFT.flatMap((e) => e.models);

    expect(new Set(seen).size).toBe(seen.length);
  });

  it('Seedance porta il catalogo dei suoi difetti — riflessi, gemelli, watermark', () => {
    const text = videoCraftFor(SEEDANCE_25_MODEL);

    expect(text).toMatch(/reflection|mirror/i);
    expect(text).toMatch(/duplicate|twin/i);
    expect(text).toMatch(/watermark|subtitle/i);
  });

  it('Kling vuole frasi corte, e lo dice', () => {
    expect(videoCraftFor(KLING_3_VIDEO_MODEL)).toMatch(/short|sentence/i);
  });

  it('Grok pesa le prime parole, e lo dice', () => {
    expect(videoCraftFor(GROK_IMAGINE_VIDEO_MODEL)).toMatch(/first|front/i);
  });

  it('due modelli diversi non ricevono lo stesso testo', () => {
    expect(videoCraftFor(SEEDANCE_25_MODEL)).not.toBe(videoCraftFor(KLING_3_VIDEO_MODEL));
  });

  it('un modello che non conosciamo non riceve consigli inventati', () => {
    expect(videoCraftFor('un-modello-mai-visto')).toBe('');
    expect(videoCraftFor(undefined)).toBe('');
  });

  it('una famiglia si riconosce dal prefisso: seedance-2-fast è pur sempre seedance', () => {
    expect(videoCraftFor('bytedance/seedance-2-fast')).toBe(videoCraftFor(SEEDANCE_25_MODEL));
  });
});
