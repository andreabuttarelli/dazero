import { mulberry32 } from './seeded-random';
import type { Pixels } from './types';

const PALETTE_SIZE = 8;
const LUMINANCE_BUCKETS = PALETTE_SIZE;

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const seed = Math.round(Number(params.seed) || 0);
	const random = mulberry32(seed);
	const palette = Array.from({ length: PALETTE_SIZE }, () => [
		Math.round(random() * 255),
		Math.round(random() * 255),
		Math.round(random() * 255)
	]);

	const out = new Uint8ClampedArray(pixels.data.length);

	for (let i = 0; i < pixels.data.length; i += 4) {
		const luminance = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2];
		const bucket = Math.min(LUMINANCE_BUCKETS - 1, Math.floor((luminance / 255) * LUMINANCE_BUCKETS));
		const [r, g, b] = palette[bucket];
		out[i] = r;
		out[i + 1] = g;
		out[i + 2] = b;
		out[i + 3] = pixels.data[i + 3];
	}

	return { width: pixels.width, height: pixels.height, data: out };
}
