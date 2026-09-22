import { expect, it } from 'vitest';
import { createWriteQueue } from './write-queue';

it('waits for the previous save before reading the next version', async () => {
  const enqueue = createWriteQueue();
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  let version = 1;
  const seen: number[] = [];
  const first = enqueue('node', async () => { seen.push(version); await barrier; version = 2; });
  const second = enqueue('node', async () => { seen.push(version); });
  await Promise.resolve();
  expect(seen).toEqual([1]);
  release();
  await Promise.all([first, second]);
  expect(seen).toEqual([1, 2]);
});
