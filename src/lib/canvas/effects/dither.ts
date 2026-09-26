import type { Pixels } from './types';

const BAYER_4X4 = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5]
];

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const mode = String(params.mode ?? 'floyd-steinberg');

	if (mode === 'ordered') {
		return applyOrdered(pixels);
	}

	return applyFloydSteinberg(pixels);
}

function toGrayscale(pixels: Pixels): Float32Array {
	const gray = new Float32Array(pixels.width * pixels.height);

	for (let p = 0; p < gray.length; p++) {
		const i = p * 4;
		gray[p] = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2];
	}

	return gray;
}

function applyFloydSteinberg(pixels: Pixels): Pixels {
	const { width, height } = pixels;
	const gray = toGrayscale(pixels);
	const out = new Uint8ClampedArray(pixels.data.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const p = y * width + x;
			const old = gray[p];
			const value = old < 128 ? 0 : 255;
			const error = old - value;

			gray[p] = value;
			distributeError(gray, width, height, x, y, error);

			const i = p * 4;
			out[i] = value;
			out[i + 1] = value;
			out[i + 2] = value;
			out[i + 3] = pixels.data[i + 3];
		}
	}

	return { width, height, data: out };
}

function distributeError(gray: Float32Array, width: number, height: number, x: number, y: number, error: number): void {
	addError(gray, width, height, x + 1, y, error * (7 / 16));
	addError(gray, width, height, x - 1, y + 1, error * (3 / 16));
	addError(gray, width, height, x, y + 1, error * (5 / 16));
	addError(gray, width, height, x + 1, y + 1, error * (1 / 16));
}

function addError(gray: Float32Array, width: number, height: number, x: number, y: number, amount: number): void {
	if (x < 0 || x >= width || y < 0 || y >= height) {
		return;
	}

	gray[y * width + x] += amount;
}

function applyOrdered(pixels: Pixels): Pixels {
	const { width, height } = pixels;
	const gray = toGrayscale(pixels);
	const out = new Uint8ClampedArray(pixels.data.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const threshold = (BAYER_4X4[y % 4][x % 4] / 16) * 255;
			const p = y * width + x;
			const value = gray[p] > threshold ? 255 : 0;
			const i = p * 4;
			out[i] = value;
			out[i + 1] = value;
			out[i + 2] = value;
			out[i + 3] = pixels.data[i + 3];
		}
	}

	return { width, height, data: out };
}
