import { describe, expect, it } from 'vitest';
import {
  isSeedance25Model,
  isSeedanceFamily,
  modelSupportsReferenceVideo,
  SEEDANCE_25_MODEL,
  VIDEO_ROLES,
  videoModelsForRole,
  videoModelSpec,
  videoModelForRole,
  VIDEO_MODEL_CHOICES,
  GROK_IMAGINE_VIDEO_MODEL,
  KLING_3_VIDEO_MODEL
} from '$lib/video-models';

describe('video model reference capabilities', () => {
  it('Seedance family accepts reference videos', () => {
    expect(modelSupportsReferenceVideo(SEEDANCE_25_MODEL)).toBe(true);
    expect(modelSupportsReferenceVideo('bytedance/seedance-2')).toBe(true);
    expect(modelSupportsReferenceVideo('bytedance/seedance-2-fast')).toBe(true);
    expect(isSeedanceFamily(SEEDANCE_25_MODEL)).toBe(true);
    expect(isSeedance25Model(SEEDANCE_25_MODEL)).toBe(true);
  });

  it('Grok Imagine does not accept reference videos (images only)', () => {
    expect(modelSupportsReferenceVideo('grok-imagine-video-1-5-preview')).toBe(false);
    expect(isSeedanceFamily('grok-imagine-video-1-5-preview')).toBe(false);
  });
});

describe('videoModelSpec risolve ogni id a se stesso', () => {
  it('bytedance/seedance-2-fast non risolve allo spec di seedance-2', () => {
    expect(videoModelSpec('bytedance/seedance-2-fast')?.id).toBe('bytedance/seedance-2-fast');
  });

  it('bytedance/seedance-2-mini non risolve allo spec di seedance-2', () => {
    expect(videoModelSpec('bytedance/seedance-2-mini')?.id).toBe('bytedance/seedance-2-mini');
  });

  it('ogni id esatto dei quattro Seedance risolve a se stesso', () => {
    const ids = ['bytedance/seedance-2-5', 'bytedance/seedance-2', 'bytedance/seedance-2-fast', 'bytedance/seedance-2-mini'];
    expect(ids.map((id) => videoModelSpec(id)?.id)).toEqual(ids);
  });
});

describe('the role registry', () => {
  it('offers a model for each of the four video jobs', () => {
    for (const role of VIDEO_ROLES) {
      expect(videoModelsForRole(role).length, role).toBeGreaterThan(0);
    }
  });

  it('never offers a model for a job it cannot do', () => {
    // Grok animates and writes from text; it has no video input at all, so it can neither
    // refine an existing clip nor take a driving video for motion control.
    const refine = videoModelsForRole('refine').map((c) => c.id);
    const motion = videoModelsForRole('motion').map((c) => c.id);
    expect(refine).not.toContain(GROK_IMAGINE_VIDEO_MODEL);
    expect(motion).not.toContain(GROK_IMAGINE_VIDEO_MODEL);
  });

  it('falls back to the clip model when no image-to-video model was chosen', () => {
    // Every brand that existed before this picker had one videoModel covering both jobs.
    // Reading videoImageModel must not silently strip that choice.
    expect(videoModelForRole({ videoModel: SEEDANCE_25_MODEL }, 'image')).toBe(SEEDANCE_25_MODEL);
    expect(videoModelForRole({ videoModel: SEEDANCE_25_MODEL, videoImageModel: KLING_3_VIDEO_MODEL }, 'image'))
      .toBe(KLING_3_VIDEO_MODEL);
  });

  it('ignores a stored model that cannot do the job it is stored for', () => {
    // A brand can keep a pref across a catalogue change. A model that lost the role must not
    // reach the provider: an unknown role id is a paid round trip that returns nothing.
    expect(videoModelForRole({ videoRefineModel: GROK_IMAGINE_VIDEO_MODEL }, 'refine')).toBeUndefined();
  });
});

/**
 * OGNI MODELLO VIVE SU OPENROUTER, O NON VIVE.
 *
 * Un modello senza `openrouterId` non ha un trasporto: il render lo rifiuterebbe, e il brand che
 * l'ha scelto scoprirebbe il buco al primo giro.
 */
describe('nessun modello video resta senza trasporto', () => {
  // Si guarda il REGISTRO, non l'elenco stretto del selettore: un modello raggiungibile per
  // ruolo — cioè da `videoModelsForRole`, che legge SPECS — deve avere un trasporto anche se il
  // selettore non lo mostra. È da lì che arrivavano gli orfani.
  it('ogni modello raggiungibile per ruolo dichiara un id OpenRouter', () => {
    const orfani = VIDEO_ROLES
      .flatMap((role) => videoModelsForRole(role))
      .map((c) => videoModelSpec(c.id))
      .filter((s) => s && !s.openrouterId)
      .map((s) => s!.id);

    expect([...new Set(orfani)], 'senza questo id il modello non è raggiungibile').toEqual([]);
  });

  it('nessuna traccia di Aleph: il ruolo refine ce l’ha chi legge un video in ingresso', () => {
    expect(videoModelSpec('runway/aleph')).toBeUndefined();
    expect(VIDEO_MODEL_CHOICES.map((c) => c.id)).not.toContain('runway/aleph');
  });

  it('i ruoli sopravvivono a entrambe le rimozioni', () => {
    for (const role of VIDEO_ROLES) {
      expect(videoModelsForRole(role).length, role).toBeGreaterThan(0);
    }
  });
});

/**
 * IL REFINE NON È PIÙ SOLO DI ALEPH.
 *
 * Aleph era l'unico modello con `roles: ['refine']`, e viveva su un fornitore che non c'è più:
 * toglierlo avrebbe tolto «rifinisci questa clip». Provato contro il gateway vero — Seedance 2.5 legge un
 * `input_references` di tipo `video_url`: un url irraggiungibile torna
 * «content[1].video_url.url ... resource download failed», cioè il provider lo SCARICA, e con un
 * video raggiungibile il job parte. Il refine ha una seconda casa, su OpenRouter.
 */
describe('il refine ha un modello raggiungibile', () => {
  it('Seedance 2.5 dichiara il ruolo refine', () => {
    expect(videoModelSpec(SEEDANCE_25_MODEL)?.roles).toContain('refine');
  });

  it('e ha un id OpenRouter, o quel ruolo resterebbe irraggiungibile', () => {
    expect(videoModelSpec(SEEDANCE_25_MODEL)?.openrouterId).toBeTruthy();
  });

  it('almeno un modello refine è servibile da OpenRouter', () => {
    const refiners = videoModelsForRole('refine').map((m) => videoModelSpec(m.id));

    expect(refiners.some((s) => s?.openrouterId), 'nessun refine raggiungibile').toBe(true);
  });
});
