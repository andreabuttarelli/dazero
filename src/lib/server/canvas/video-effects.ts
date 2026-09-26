import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ensureFfmpegPath } from '$lib/server/ffmpeg-bin';
import { applyStack, type EffectStep, type Pixels } from '$lib/canvas/effects';

const OUTPUT_FPS = 30;

export type RenderedEffectsVideo = {
  bytes: Buffer;
  mimeType: 'video/mp4';
  width: number;
  height: number;
};

export async function renderVideoEffects(input: Buffer, steps: EffectStep[]): Promise<RenderedEffectsVideo> {
  const ffmpeg = await ensureFfmpegPath();
  if (!ffmpeg) {
    throw new Error('ffmpeg_unavailable');
  }

  const dir = await mkdtemp(join(tmpdir(), 'canvas-effects-'));
  const source = join(dir, 'source');
  const frames = join(dir, 'frame-%08d.png');
  const output = join(dir, 'output.mp4');

  try {
    await writeFile(source, input);
    await run(ffmpeg, ['-i', source, '-vf', `fps=${OUTPUT_FPS}`, '-y', frames]);

    const names = (await readdir(dir)).filter((name) => name.startsWith('frame-')).sort();
    if (names.length === 0) {
      throw new Error('video_has_no_frames');
    }

    let width = 0;
    let height = 0;
    for (const name of names) {
      const path = join(dir, name);
      const decoded = await decode(await readFile(path));
      width = decoded.width;
      height = decoded.height;
      await writeFile(path, await encode(applyStack(decoded, steps)));
    }

    await run(ffmpeg, [
      '-framerate', String(OUTPUT_FPS), '-i', frames,
      '-i', source,
      '-map', '0:v:0', '-map', '1:a?',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', '-movflags', '+faststart', '-y', output
    ]);

    return { bytes: await readFile(output), mimeType: 'video/mp4', width, height };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}

async function decode(bytes: Buffer): Promise<Pixels> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

function encode(pixels: Pixels): Promise<Buffer> {
  return sharp(Buffer.from(pixels.data), {
    raw: { width: pixels.width, height: pixels.height, channels: 4 }
  }).png().toBuffer();
}
