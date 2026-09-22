import { describe, expect, it } from 'vitest';
import { PLATFORM_IDS } from './platforms';
import { AUTOMATION_BLOCKED_PLATFORMS } from './platform-terms';
import { CAROUSEL_PLATFORMS } from './server/carousel-craft';
import { PLATFORM_KEYS } from './components/platform-meta';
import { TARGET_PLATFORMS } from '@dazero/api-contracts';

const VOCAB: readonly string[] = Object.values(PLATFORM_IDS);

describe('platform vocabulary', () => {
  it('declares each id exactly once', () => {
    expect(new Set(VOCAB).size).toBe(VOCAB.length);
  });
});

describe('frozen platform sets', () => {
  it('carousel-capable platforms keep their exact values', () => {
    expect([...CAROUSEL_PLATFORMS]).toEqual(['instagram', 'facebook', 'linkedin']);
  });
});

describe('every set draws its ids from the vocabulary', () => {
  it.each([
    ['carousel', [...CAROUSEL_PLATFORMS]],
    ['automation-blocked', AUTOMATION_BLOCKED_PLATFORMS.map((p) => p.id)]
  ] as const)('%s ids are all declared in PLATFORM_IDS', (_name, members) => {
    for (const id of members) {
      expect(VOCAB).toContain(id);
    }
  });
});

describe('le piattaforme che un agente puo scegliere', () => {
  it('sono esattamente quelle su cui il prodotto lavora', () => {
    // Il contratto non puo' importare `$lib`, quindi l'elenco vive anche li'. Una piattaforma
    // aggiunta qui e non di la' sarebbe selezionabile dal browser e rifiutata dal tool.
    expect([...TARGET_PLATFORMS]).toEqual(PLATFORM_KEYS);
  });
});
