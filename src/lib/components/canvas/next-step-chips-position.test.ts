import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(process.cwd(), 'src/lib/components/canvas');
const bridge = readFileSync(join(dir, 'CanvasSelectionBridge.svelte'), 'utf8');
const flow = readFileSync(join(dir, 'CanvasFlow.svelte'), 'utf8');
const chips = readFileSync(join(dir, 'NextStepChips.svelte'), 'utf8');

describe('next-step suggestions position', () => {
  it('places suggestions below the selected node body', () => {
    expect(bridge).toContain('height: bottomLeft.y - topLeft.y');
    expect(flow).toContain('height: number');
    expect(chips).toContain('top:${box.y + box.height + 8}px');
    expect(chips).toContain('width: max-content');
    expect(chips).toContain('justify-content: center');
  });
});
