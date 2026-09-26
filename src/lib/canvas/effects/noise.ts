import { mulberry32 } from './seeded-random';
import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const amount = Math.max(0, Number(params.amount) || 0);
	const seed = Math.round(Number(params.seed) || 0);
	const random = mulberry32(seed);
	const out = new Uint8ClampedArray(pixels.data.length);

	for (let i = 0; i < pixels.data.length; i += 4) {
		const offset = (random() - 0.5) * amount;
		out[i] = pixels.data[i] + offset;
		out[i + 1] = pixels.data[i + 1] + offset;
		out[i + 2] = pixels.data[i + 2] + offset;
		out[i + 3] = pixels.data[i + 3];
	}

	return { width: pixels.width, height: pixels.height, data: out };
}
