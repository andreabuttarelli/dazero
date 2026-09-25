import { GROK_IMAGINE_VIDEO_MODEL } from '$lib/video-models';
import { describe, it, expect } from 'vitest';
import {
  buildVideoPrompt,
  fitScriptToDuration,
  clampVideoDuration,
  clampVideoResolution,
  clampVideoAspectRatio,
  videoModelCaps,
  videoDurationOptions,
  suggestVideoDuration,
  resolveVideoDuration,
  resolveVideoModel,
  pairedTextToVideoModel,
  isKnownVideoModel,
  transformVideo,
  spokenWordCount,
  MIN_DURATION,
  DEFAULT_VIDEO_DURATION
} from './video';

const IMAGE_PROMPT =
  'Photorealistic product photo of the Capy60 keyboard on a sunlit walnut desk, morning light, shallow depth of field.';

describe('buildVideoPrompt', () => {
  it('with a cover: anchors to the attached image and directs motion, not a new scene', () => {
    const p = buildVideoPrompt(IMAGE_PROMPT, { hasCover: true });
    expect(p).toContain('Animate the attached image');
    expect(p).toContain('do not change it');
    expect(p).toContain('MOTION:');
    expect(p).toContain('FIDELITY:');
    expect(p).toContain('Capy60'); // the scene stays as reference
  });

  it('with a cover: ignores visualStyle (style is already in the pixels)', () => {
    const p = buildVideoPrompt(IMAGE_PROMPT, { hasCover: true, visualStyle: 'Moody monochrome, hard shadows' });
    expect(p).not.toContain('BRAND VISUAL STYLE');
  });

  it('text-to-video fallback: keeps the scene and folds in the brand visual style', () => {
    const p = buildVideoPrompt(IMAGE_PROMPT, { hasCover: false, visualStyle: 'Moody monochrome, hard shadows' });
    expect(p).toContain('Capy60');
    expect(p).toContain('BRAND VISUAL STYLE to match: Moody monochrome, hard shadows');
    expect(p).toContain('MOTION:');
    expect(p).toContain('FIDELITY:');
    expect(p).not.toContain('attached image');
  });

  it('clamps a runaway image prompt so the scene stays a reference, not the whole brief', () => {
    const long = 'word '.repeat(500);
    const p = buildVideoPrompt(long, { hasCover: true });
    // 600-char scene cap + fixed scaffolding — far below the raw 2500-char prompt.
    expect(p.length).toBeLessThan(1400);
  });
});

describe('buildVideoPrompt — talking clips', () => {
  it('quotes the spoken line verbatim and forbids any other speech', () => {
    const p = buildVideoPrompt(IMAGE_PROMPT, { hasCover: true, script: 'This keyboard changed my desk setup.' });
    expect(p).toContain('"This keyboard changed my desk setup."');
    expect(p).toContain('and nothing else');
    expect(p).toContain('No voice-over narrator');
  });

  it('swaps the ambient-motion brief for a lip-sync delivery brief', () => {
    const talking = buildVideoPrompt(IMAGE_PROMPT, { hasCover: true, script: 'Hello there.' });
    expect(talking).toContain('natural lip-sync');
    expect(talking).not.toContain('steam rising'); // the silent b-roll motion brief is gone
  });

  it('keeps the no-on-screen-text rule — captions stay ours, spoken words are audio', () => {
    const p = buildVideoPrompt(IMAGE_PROMPT, { hasCover: true, script: 'Hello there.' });
    expect(p).toContain('no on-screen text or logos');
  });

  it('without a script the prompt is byte-identical to the silent b-roll one', () => {
    const bare = buildVideoPrompt(IMAGE_PROMPT, { hasCover: true });
    expect(buildVideoPrompt(IMAGE_PROMPT, { hasCover: true, script: '' })).toBe(bare);
    expect(buildVideoPrompt(IMAGE_PROMPT, { hasCover: true, script: '   ' })).toBe(bare);
    expect(buildVideoPrompt(IMAGE_PROMPT, { hasCover: true, script: null })).toBe(bare);
  });

  it('works in the text-to-video fallback too (no cover)', () => {
    const p = buildVideoPrompt(IMAGE_PROMPT, { hasCover: false, script: 'Hello there.', visualStyle: 'Moody' });
    expect(p).toContain('"Hello there."');
    expect(p).toContain('BRAND VISUAL STYLE to match: Moody');
  });
});

describe('buildVideoPrompt — freeform (AI prompt)', () => {
  it('uses the AI brief and skips the hardcoded cinematic MOTION template', () => {
    const brief = 'Slow orbit around a walnut desk product, soft window light, no person, ambient tone only.';
    const p = buildVideoPrompt('product on desk', {
      hasCover: true,
      prompt: brief,
      script: 'optional line'
    });
    expect(p).toContain('CREATIVE BRIEF');
    expect(p).toContain(brief);
    expect(p).not.toContain('handheld wobble');
    expect(p).not.toContain('slow push-in, gentle pan');
    expect(p).not.toContain('Unedited raw footage');
    expect(p).toContain('"optional line"');
    expect(p.startsWith('ABSOLUTE RULE')).toBe(true);
  });

  it('still anchors to the cover scene', () => {
    const p = buildVideoPrompt('Capy60 keyboard on walnut', {
      hasCover: true,
      prompt: 'Gentle parallax only'
    });
    expect(p).toContain('Capy60 keyboard on walnut');
    expect(p).toContain('first frame');
  });

  it('folds instructions without forcing a hardcoded delivery style', () => {
    const p = buildVideoPrompt('a man', {
      hasCover: true,
      prompt: 'Documentary medium shot, calm',
      instructions: 'Italian accent, quiet'
    });
    expect(p).toContain('Documentary medium shot');
    expect(p).toContain('Italian accent');
    expect(p).not.toContain('heated, argumentative');
    expect(p).not.toMatch(/ONE IMPOSSIBLE THING/i);
  });
});

describe('videoModelCaps', () => {
  it('Seedance 2.5 allows up to 30s and does not support Grok upscale', () => {
    const caps = videoModelCaps('bytedance/seedance-2-5');
    expect(caps.family).toBe('seedance-2-5');
    expect(caps.minDuration).toBe(4);
    expect(caps.maxDuration).toBe(30);
    expect(caps.supportsUpscale).toBe(false);
    expect(caps.generateAudio).toBe(true);
    expect(caps.ratios).toContain('adaptive');
    expect(caps.ratios).toContain('21:9');
  });

  it('Seedance 2 / fast / mini stay on the 15s ceiling', () => {
    for (const m of ['bytedance/seedance-2', 'bytedance/seedance-2-fast', 'bytedance/seedance-2-mini']) {
      const caps = videoModelCaps(m);
      expect(caps.family).toBe('seedance-2');
      expect(caps.maxDuration).toBe(15);
      expect(caps.minDuration).toBe(4);
      expect(caps.supportsUpscale).toBe(false);
      expect(caps.generateAudio).toBe(true);
    }
  });

  it('does not mis-classify Seedance 2.5 as Seedance 2', () => {
    // Regression: a naive /^bytedance\/seedance-2/ regex would give 2.5 the 15s ceiling.
    expect(videoModelCaps('bytedance/seedance-2-5').maxDuration).toBe(30);
    expect(videoModelCaps('bytedance/seedance-2').maxDuration).toBe(15);
  });

  it('Grok 1.5 and v1 share a 15s ceiling and support upscale', () => {
    expect(videoModelCaps('grok-imagine-video-1-5-preview')).toMatchObject({
      family: 'grok-1.5',
      minDuration: 1,
      maxDuration: 15,
      maxPromptChars: 4096,
      supportsUpscale: true,
      generateAudio: false
    });
    expect(videoModelCaps('grok-imagine/text-to-video')).toMatchObject({
      family: 'grok-v1',
      maxDuration: 15,
      supportsUpscale: true
    });
  });
});

describe('clampVideoDuration (model-aware)', () => {
  // Questo test asseriva il PAVIMENTO DI PRODOTTO a 10 secondi — «una clip troppo corta per reggere
  // una cta non e' un risparmio». Era una decisione difendibile e Andrea l'ha rovesciata: ha chiesto
  // 5 secondi e ne ha pagati 10, e i video si fatturano al secondo. Il minimo ora viene dal modello,
  // che e' un fatto pubblicato, non da una costante nostra.
  it('scende al minimo DEL MODELLO, che e un fatto e non una nostra preferenza', () => {
    expect(clampVideoDuration(3, 'grok-imagine-video-1-5-preview')).toBe(3);
    expect(clampVideoDuration(6, 'bytedance/seedance-2-5')).toBe(6);
    // Seedance 2 parte da 4: uno non e' ottenibile e diventa quattro, non dieci.
    expect(clampVideoDuration(1, 'bytedance/seedance-2')).toBe(4);
  });

  it('caps at the CHOSEN model ceiling — not a global constant', () => {
    expect(clampVideoDuration(13, 'grok-imagine-video-1-5-preview')).toBe(13);
    expect(clampVideoDuration(30, 'grok-imagine-video-1-5-preview')).toBe(15);
    expect(clampVideoDuration(30, 'bytedance/seedance-2')).toBe(15);
    expect(clampVideoDuration(30, 'bytedance/seedance-2-5')).toBe(30);
    expect(clampVideoDuration(20, 'bytedance/seedance-2-5')).toBe(20);
  });

  it('falls back to the default rather than 0 for junk input', () => {
    expect(clampVideoDuration('abc', 'bytedance/seedance-2-5')).toBe(DEFAULT_VIDEO_DURATION);
    expect(clampVideoDuration(undefined, 'grok-imagine-video-1-5-preview')).toBe(DEFAULT_VIDEO_DURATION);
  });

  it('the product floor is above Seedance/Grok provider floors, deliberately', () => {
    expect(MIN_DURATION).toBeGreaterThan(videoModelCaps('bytedance/seedance-2-5').minDuration);
    expect(MIN_DURATION).toBeGreaterThan(videoModelCaps('grok-imagine-video-1-5-preview').minDuration);
  });
});

describe('videoDurationOptions', () => {
  it('Grok / Seedance 2 stop at 15s', () => {
    expect(videoDurationOptions('grok-imagine-video-1-5-preview')).toEqual([10, 13, 15]);
    expect(videoDurationOptions('bytedance/seedance-2')).toEqual([10, 13, 15]);
    expect(videoDurationOptions('bytedance/seedance-2-fast')).toEqual([10, 13, 15]);
  });

  it('Seedance 2.5 unlocks 20s and 30s', () => {
    expect(videoDurationOptions('bytedance/seedance-2-5')).toEqual([10, 13, 15, 20, 30]);
  });
});

describe('suggestVideoDuration / resolveVideoDuration', () => {
  it('empty script uses the product floor — not a hard-coded 13s default', () => {
    expect(suggestVideoDuration('', 'grok-imagine-video-1-5-preview')).toBe(MIN_DURATION);
    expect(suggestVideoDuration(null, 'bytedance/seedance-2-5')).toBe(MIN_DURATION);
  });

  it('sizes to the shortest rung that can hold every word (never undershoot)', () => {
    // maxWordsForDuration(10)=32, (13)=41, (15)=48 on 3.5 w/s × 0.92
    const ten = Array.from({ length: 32 }, (_, i) => `w${i}`).join(' ');
    const fifteen = Array.from({ length: 48 }, (_, i) => `w${i}`).join(' ');
    expect(suggestVideoDuration(ten, 'grok-imagine-video-1-5-preview')).toBe(10);
    expect(suggestVideoDuration(fifteen, 'grok-imagine-video-1-5-preview')).toBe(15);
    // 45 words is nearer to 13s raw, but 13s only holds 41 — must bump to 15.
    const fortyFive = Array.from({ length: 45 }, (_, i) => `w${i}`).join(' ');
    expect(suggestVideoDuration(fortyFive, 'bytedance/seedance-2-5')).toBe(15);
  });

  it('Seedance 2.5 can suggest 20s/30s for longer scripts', () => {
    const long = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    expect(suggestVideoDuration(long, 'bytedance/seedance-2-5')).toBe(30);
    expect(suggestVideoDuration(long, 'grok-imagine-video-1-5-preview')).toBe(15);
  });

  it('resolveVideoDuration grows too-short durations to fit the script', () => {
    const long = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    expect(resolveVideoDuration(10, long, 'bytedance/seedance-2-5')).toBe(30);
    const short = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    expect(resolveVideoDuration(15, short, 'bytedance/seedance-2-5')).toBe(15);
    expect(resolveVideoDuration(undefined, long, 'bytedance/seedance-2-5')).toBe(30);
    expect(resolveVideoDuration(undefined, undefined, 'grok-imagine-video-1-5-preview')).toBe(
      DEFAULT_VIDEO_DURATION
    );
  });

  it('concise PAS (~42 words) fits a 15s clip without losing the solution', () => {
    const pas =
      "I was still writing captions at midnight and nothing had posted. It was eating my evenings — then feega drafted the visuals and the copy, I just tap approve. Anyway try it and tell me I'm wrong.";
    expect(resolveVideoDuration(15, pas, 'bytedance/seedance-2-5')).toBe(15);
    const fitted = fitScriptToDuration(pas, 15);
    expect(fitted.toLowerCase()).toMatch(/feega/);
    expect(fitted.toLowerCase()).toMatch(/tell me i'm wrong|try it/);
    expect(spokenWordCount(fitted)).toBeLessThanOrEqual(48);
  });
});

describe('resolveVideoModel reads the job, not one setting', () => {
  it('animates a cover with the animate model and writes from text with the clip model', () => {
    const prefs = { videoModel: 'bytedance/seedance-2', videoImageModel: 'grok-imagine/image-to-video' };
    expect(resolveVideoModel({ prefs, hasCover: true })).toBe('grok-imagine/image-to-video');
    expect(resolveVideoModel({ prefs, hasCover: false })).toBe('bytedance/seedance-2');
  });

  it('keeps using the clip model for both when no animate model was chosen', () => {
    // Every brand from before the split had one setting covering both directions.
    const prefs = { videoModel: 'bytedance/seedance-2-5' };
    expect(resolveVideoModel({ prefs, hasCover: true })).toBe('bytedance/seedance-2-5');
    expect(resolveVideoModel({ prefs, hasCover: false })).toBe('bytedance/seedance-2-5');
  });

  it('lets an explicit model from the tool beat both settings', () => {
    const prefs = { videoModel: 'bytedance/seedance-2', videoImageModel: 'bytedance/seedance-2-mini' };
    expect(resolveVideoModel({ model: 'bytedance/seedance-2-5', prefs, hasCover: true })).toBe('bytedance/seedance-2-5');
  });
});

describe('resolveVideoModel / pairedTextToVideoModel', () => {
  it('Seedance uses the same id for I2V and T2V', () => {
    expect(pairedTextToVideoModel('bytedance/seedance-2-5')).toBe('bytedance/seedance-2-5');
    expect(resolveVideoModel({ model: 'bytedance/seedance-2-5', hasCover: true })).toBe('bytedance/seedance-2-5');
    expect(resolveVideoModel({ model: 'bytedance/seedance-2-5', hasCover: false })).toBe('bytedance/seedance-2-5');
  });

  it('Grok I2V preference falls back to the paired T2V when there is no cover', () => {
    expect(resolveVideoModel({ model: 'grok-imagine-video-1-5-preview', hasCover: true })).toBe(
      'grok-imagine-video-1-5-preview'
    );
    expect(resolveVideoModel({ model: 'grok-imagine-video-1-5-preview', hasCover: false })).toBe(
      pairedTextToVideoModel('grok-imagine-video-1-5-preview')
    );
  });

  it('isKnownVideoModel accepts only the Settings / tool allow-list', () => {
    expect(isKnownVideoModel('bytedance/seedance-2-5')).toBe(true);
    expect(isKnownVideoModel('bytedance/seedance-2-mini')).toBe(true);
    expect(isKnownVideoModel('grok-imagine-video-1-5-preview')).toBe(true);
    expect(isKnownVideoModel('bytedance/seedance-1.5-pro')).toBe(false);
    expect(isKnownVideoModel('')).toBe(false);
  });
});

describe('clampVideoAspectRatio', () => {
  it('Seedance keeps ratios Grok would rewrite to 9:16', () => {
    expect(clampVideoAspectRatio('21:9', 'bytedance/seedance-2-5')).toBe('21:9');
    expect(clampVideoAspectRatio('4:3', 'bytedance/seedance-2')).toBe('4:3');
    expect(clampVideoAspectRatio('adaptive', 'bytedance/seedance-2-5')).toBe('adaptive');
    expect(clampVideoAspectRatio('21:9', 'grok-imagine-video-1-5-preview')).toBe('9:16');
  });
});

describe('fitScriptToDuration', () => {
  it('leaves a line that already fits untouched', () => {
    expect(fitScriptToDuration('Short and punchy line here', 6)).toBe('Short and punchy line here');
  });

  it('cuts an over-long line on a WORD boundary, never mid-word', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const out = fitScriptToDuration(long, 6);
    expect(out.split(' ')).toHaveLength(19); // floor(6 * 3.5 * 0.92)
    expect(out.endsWith('word18')).toBe(true);
    expect(long.startsWith(out)).toBe(true); // a clean prefix, nothing severed
  });

  it('prefers a sentence boundary inside the keep window', () => {
    const words = [
      ...Array.from({ length: 12 }, (_, i) => `a${i}`),
      'done.',
      ...Array.from({ length: 30 }, (_, i) => `b${i}`)
    ];
    const out = fitScriptToDuration(words.join(' '), 6); // max 19 words
    expect(out.endsWith('done.')).toBe(true);
    expect(out.split(' ')).toHaveLength(13);
  });

  it('normalises whitespace and always keeps at least one word', () => {
    expect(fitScriptToDuration('  hello   there  ', 6)).toBe('hello there');
    expect(fitScriptToDuration('alpha beta gamma', 0)).toBe('alpha');
  });
});

/**
 * IL MESTIERE SI DICHIARA, e il registro è l'unico a saperlo.
 *
 * Un modello salvato che non sa rifinire non deve raggiungere il fornitore: sarebbe un giro di
 * rete pagato che non torna nulla, e il rifiuto deve nominare il mestiere che manca.
 */
describe('transformVideo rifiuta un modello che quel mestiere non lo fa', () => {
  const supabase = {} as never;

  it('lo dice invece di spendere', async () => {
    await expect(
      transformVideo({
        supabase,
        userId: 'user-1',
        role: 'refine',
        videoUrl: 'https://x/c.mp4',
        model: GROK_IMAGINE_VIDEO_MODEL
      })
    ).rejects.toThrow(/refine/);
  });
});
