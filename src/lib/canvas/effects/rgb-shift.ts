import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const rx = Math.round(Number(params.rx) || 0);
	const ry = Math.round(Number(params.ry) || 0);
	const gx = Math.round(Number(params.gx) || 0);
	const gy = Math.round(Number(params.gy) || 0);
	const bx = Math.round(Number(params.bx) || 0);
	const by = Math.round(Number(params.by) || 0);
	const { width, height, data } = pixels;
	const out = new Uint8ClampedArray(data.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			out[i] = sampleChannel(pixels, x - rx, y - ry, 0);
			out[i + 1] = sampleChannel(pixels, x - gx, y - gy, 1);
			out[i + 2] = sampleChannel(pixels, x - bx, y - by, 2);
			out[i + 3] = data[i + 3];
		}
	}

	return { width, height, data: out };
}

function sampleChannel(pixels: Pixels, x: number, y: number, channel: number): number {
	if (x < 0 || x >= pixels.width || y < 0 || y >= pixels.height) {
		return 0;
	}

	return pixels.data[(y * pixels.width + x) * 4 + channel];
}
