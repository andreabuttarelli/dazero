import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ensureFfmpegPath } from '$lib/server/ffmpeg-bin';
import { renderVideoEffects } from './video-effects';
import sharp from 'sharp';

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stderr) : reject(new Error(stderr)));
  });
}

describe('renderVideoEffects', () => {
  it('applies the stack and preserves an audio track', async () => {
    const ffmpeg = await ensureFfmpegPath();
    expect(ffmpeg).not.toBeNull();
    const dir = await mkdtemp(join(tmpdir(), 'effects-video-test-'));
    const input = join(dir, 'input.mp4');
    try {
      await run(ffmpeg!, [
        '-f', 'lavfi', '-i', 'testsrc2=s=32x32:r=10:d=0.4',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.4',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', input
      ]);

      const output = await renderVideoEffects(await readFile(input), [
        { id: 'pixelate', params: { blockSize: 4 }, enabled: true }
      ]);
      const outputPath = join(dir, 'output.mp4');
      const inputFrame = join(dir, 'input.png');
      const outputFrame = join(dir, 'output.png');
      await writeFile(outputPath, output.bytes);
      const probe = await run(ffmpeg!, ['-i', outputPath, '-f', 'null', '-']);
      await run(ffmpeg!, ['-i', input, '-frames:v', '1', '-y', inputFrame]);
      await run(ffmpeg!, ['-i', outputPath, '-frames:v', '1', '-y', outputFrame]);

      expect(output.mimeType).toBe('video/mp4');
      expect(output.width).toBe(32);
      expect(output.height).toBe(32);
      expect(probe).toMatch(/Audio:/);
      expect(probe).toMatch(/10 fps/);
      expect(Buffer.compare(await sharp(inputFrame).raw().toBuffer(), await sharp(outputFrame).raw().toBuffer())).not.toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
