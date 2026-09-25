import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const levels = Math.max(2, Math.round(Number(params.levels) || 2));
	const step = 255 / (levels - 1);
	const out = new Uint8ClampedArray(pixels.data.length);

	for (let i = 0; i < pixels.data.length; i += 4) {
		out[i] = quantize(pixels.data[i], step);
		out[i + 1] = quantize(pixels.data[i + 1], step);
		out[i + 2] = quantize(pixels.data[i + 2], step);
		out[i + 3] = pixels.data[i + 3];
	}

	return { width: pixels.width, height: pixels.height, data: out };
}

function quantize(value: number, step: number): number {
	return Math.round(Math.round(value / step) * step);
}
