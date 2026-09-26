import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const node = readFileSync(join(dir, 'CompositionNode.svelte'), 'utf8');
const preview = readFileSync(join(dir, 'CompositionPreview.svelte'), 'utf8');

describe('composition node preview', () => {
  it('renders the connected media with the saved composition settings', () => {
    expect(node).toMatch(/<CompositionPreview[^>]*node[^>]*mediaUrls/);
    expect(preview).toMatch(/createCompositionScene/);
    expect(preview).toMatch(/requestAnimationFrame/);
  });
});
