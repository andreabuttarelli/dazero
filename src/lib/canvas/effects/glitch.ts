import { mulberry32 } from './seeded-random';
import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const amount = Math.max(0, Number(params.amount) || 0);
	const sliceHeight = Math.max(1, Math.round(Number(params.sliceHeight) || 1));
	const seed = Math.round(Number(params.seed) || 0);
	const random = mulberry32(seed);
	const { width, height, data } = pixels;
	const out = new Uint8ClampedArray(data.length);

	for (let sliceTop = 0; sliceTop < height; sliceTop += sliceHeight) {
		const sliceBottom = Math.min(height, sliceTop + sliceHeight);
		const offset = amount === 0 ? 0 : Math.round((random() - 0.5) * 2 * amount);

		for (let y = sliceTop; y < sliceBottom; y++) {
			for (let x = 0; x < width; x++) {
				const srcX = ((x - offset) % width + width) % width;
				const srcI = (y * width + srcX) * 4;
				const dstI = (y * width + x) * 4;
				out[dstI] = data[srcI];
				out[dstI + 1] = data[srcI + 1];
				out[dstI + 2] = data[srcI + 2];
				out[dstI + 3] = data[srcI + 3];
			}
		}
	}

	return { width, height, data: out };
}
