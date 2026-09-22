import { describe, expect, it } from 'vitest';
import { PLATFORM_IDS } from './platforms';
import { PLATFORM_KEYS } from './components/platform-meta';
import { TARGET_PLATFORMS } from '@dazero/api-contracts';

const VOCAB: readonly string[] = Object.values(PLATFORM_IDS);

describe('platform vocabulary', () => {
  it('declares each id exactly once', () => {
    expect(new Set(VOCAB).size).toBe(VOCAB.length);
  });
});

describe('le piattaforme che un agente puo scegliere', () => {
  it('sono esattamente quelle su cui il prodotto lavora', () => {
    // Il contratto non puo' importare `$lib`, quindi l'elenco vive anche li'. Una piattaforma
    // aggiunta qui e non di la' sarebbe selezionabile dal browser e rifiutata dal tool.
    expect([...TARGET_PLATFORMS]).toEqual(PLATFORM_KEYS);
  });
});
