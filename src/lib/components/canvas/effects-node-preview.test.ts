import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const node = readFileSync(join(dir, 'EffectsNode.svelte'), 'utf8');
const preview = readFileSync(join(dir, 'EffectsPreview.svelte'), 'utf8');

describe('effects node preview', () => {
  it('applies the stack to video frames inside the node body', () => {
    expect(node).toMatch(/<EffectsPreview[^>]*effects=/);
    expect(preview).toMatch(/applyStack/);
    expect(preview).toMatch(/requestAnimationFrame/);
  });
});
