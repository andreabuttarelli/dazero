import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { KIE_API_KEY: 'test-key' } }));
vi.mock('$lib/server/ai-log', () => ({
  getBrandContext: () => undefined,
  getOrgContext: () => undefined,
  logAiCall: vi.fn()
}));

const { buildVideoPrompt, prepareVideoRender } = await import('./video');
const { GROK_IMAGINE_VIDEO_MODEL, KLING_3_VIDEO_MODEL, SEEDANCE_25_MODEL } = await import('$lib/video-models');

const SCENE = 'A barista pulling a shot of espresso on a marble counter';

describe('il craft del modello arriva al prompt video', () => {
  it('senza modello il prompt resta quello di prima: nessuna nota comparsa dal nulla', () => {
    const p = buildVideoPrompt(SCENE, { hasCover: false });

    expect(p).not.toContain('MODEL NOTES');
  });

  it('con Seedance porta il catalogo dei difetti di Seedance', () => {
    const p = buildVideoPrompt(SCENE, { hasCover: false, model: SEEDANCE_25_MODEL });

    expect(p).toContain('MODEL NOTES');
    expect(p).toMatch(/reflection|mirror/i);
  });

  it('con Kling porta quello di Kling, che è un altro testo', () => {
    const seedance = buildVideoPrompt(SCENE, { hasCover: false, model: SEEDANCE_25_MODEL });
    const kling = buildVideoPrompt(SCENE, { hasCover: false, model: KLING_3_VIDEO_MODEL });

    expect(kling).toContain('MODEL NOTES');
    expect(kling).not.toBe(seedance);
  });

  it('un modello sconosciuto non aggiunge niente', () => {
    const p = buildVideoPrompt(SCENE, { hasCover: false, model: 'qualcosa/mai-visto' });

    expect(p).not.toContain('MODEL NOTES');
  });

  it('la scena resta la prima cosa: il craft non scavalca il soggetto', () => {
    const p = buildVideoPrompt(SCENE, { hasCover: false, model: GROK_IMAGINE_VIDEO_MODEL });

    expect(p.indexOf(SCENE)).toBeLessThan(p.indexOf('MODEL NOTES'));
  });

  // Il fotogramma pulito chiude il ramo freeform. Nell'altro la stessa cosa la dice FIDELITY, e
  // il craft non deve finire dopo nessuna delle due: una regola assoluta con una nota di mestiere
  // in coda sembra negoziabile.
  // Il cavo vero: non basta che `buildVideoPrompt` SAPPIA usare il modello, deve riceverlo dal
  // percorso che rende davvero. È il punto in cui il pavimento delle immagini si era staccato.
  it('il percorso di render passa il modello che ha risolto, non lo lascia indietro', async () => {
    const prepared = await prepareVideoRender(SCENE, { model: SEEDANCE_25_MODEL });

    expect(prepared.model).toBe(SEEDANCE_25_MODEL);
    expect(prepared.prompt).toContain('MODEL NOTES');
    expect(prepared.prompt).toMatch(/reflection|mirror/i);
  });

  it('nel ramo freeform la regola del fotogramma pulito resta ultima', () => {
    const p = buildVideoPrompt(SCENE, {
      hasCover: false,
      model: SEEDANCE_25_MODEL,
      prompt: 'un piano sequenza sul bancone, luce del mattino',
      script: 'ciao a tutti'
    });

    expect(p).toContain('MODEL NOTES');
    expect(p.lastIndexOf('CLEAN FRAME')).toBeGreaterThan(p.indexOf('MODEL NOTES'));
  });
});
