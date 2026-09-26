import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOCIAL_PLATFORMS } from './social-platforms';
import { NODE_DATA_SCHEMAS } from './node-data';

describe('SOCIAL_PLATFORMS', () => {
  it('si legge senza trascinare zod nel browser: il modulo non importa niente', () => {
    const source = readFileSync(join(__dirname, 'social-platforms.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it('è la stessa lista che lo schema del feed accetta', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      expect(NODE_DATA_SCHEMAS.social_account_feed.safeParse({ platform, handle: 'h' }).success, platform).toBe(true);
    }
  });
});
