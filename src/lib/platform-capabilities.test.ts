import { describe, expect, it } from 'vitest';
import { SOCIAL_PLATFORMS } from './canvas/node-data';
import { CAPTION_LIMIT, formatFor, PLATFORM_CAPABILITIES } from './platform-capabilities';

const image = { kind: 'image' as const };
const video = { kind: 'video' as const };
const images = (n: number) => Array.from({ length: n }, () => image);

describe('PLATFORM_CAPABILITIES', () => {
  it('has exactly one row per social_accounts_platform_check value', () => {
    expect(Object.keys(PLATFORM_CAPABILITIES).sort()).toEqual([...SOCIAL_PLATFORMS].sort());
  });

  it('declares a caption limit for every platform', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      expect(CAPTION_LIMIT[platform], platform).toBeGreaterThan(0);
    }
  });
});

describe('formatFor: one image', () => {
  it('publishes as image on every platform except the video-only ones', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      if (platform === 'youtube') continue;
      const result = formatFor(platform, [image]);
      expect(result, platform).toEqual({ ok: true, publishAs: 'image' });
    }
  });
});

describe('formatFor: one video', () => {
  it('publishes as video on every platform', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const result = formatFor(platform, [video]);
      expect(result, platform).toEqual({ ok: true, publishAs: 'video' });
    }
  });
});

describe('formatFor: no media', () => {
  it('is refused on platforms that require a visual', () => {
    for (const platform of ['instagram', 'tiktok', 'youtube'] as const) {
      const result = formatFor(platform, []);
      expect(result.ok, platform).toBe(false);
    }
  });

  it('is a text post on platforms that allow one', () => {
    for (const platform of ['facebook', 'linkedin', 'x', 'threads', 'reddit'] as const) {
      const result = formatFor(platform, []);
      expect(result, platform).toEqual({ ok: true, publishAs: 'text' });
    }
  });

  it('pinterest needs a pin image: refused with no media', () => {
    expect(formatFor('pinterest', []).ok).toBe(false);
  });
});

describe('formatFor: multiple images → carousel', () => {
  it('instagram, facebook and linkedin publish a carousel', () => {
    for (const platform of ['instagram', 'facebook', 'linkedin'] as const) {
      expect(formatFor(platform, images(3))).toEqual({ ok: true, publishAs: 'carousel' });
    }
  });

  it('x accepts up to 4 images as a multi-image post', () => {
    expect(formatFor('x', images(4))).toEqual({ ok: true, publishAs: 'multi_image' });
  });

  it('x refuses a 5th image instead of dropping it', () => {
    const result = formatFor('x', images(5));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/4/);
  });

  it('platforms with no multi-image post refuse more than one image', () => {
    for (const platform of ['threads', 'tiktok', 'youtube', 'reddit', 'pinterest'] as const) {
      const result = formatFor(platform, images(2));
      expect(result.ok, platform).toBe(false);
    }
  });
});

describe('formatFor: multiple videos', () => {
  it('is refused everywhere: every platform publishes at most one video per post', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const result = formatFor(platform, [video, video]);
      expect(result.ok, platform).toBe(false);
    }
  });
});

describe('formatFor: mixed image and video', () => {
  it('is refused on every platform, never silently dropped', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const result = formatFor(platform, [image, video]);
      expect(result.ok, platform).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('formatFor: youtube is video-only', () => {
  it('refuses an image', () => {
    expect(formatFor('youtube', [image]).ok).toBe(false);
  });

  it('accepts one video', () => {
    expect(formatFor('youtube', [video])).toEqual({ ok: true, publishAs: 'video' });
  });
});

describe('formatFor: an unknown platform is refused, not silently accepted', () => {
  it('never crashes and never says ok', () => {
    const result = formatFor('mastodon' as never, [image]);
    expect(result.ok).toBe(false);
  });
});
