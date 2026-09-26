import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const blockSize = Math.max(1, Math.round(Number(params.blockSize) || 1));
	const { width, height, data } = pixels;
	const out = new Uint8ClampedArray(data.length);

	for (let by = 0; by < height; by += blockSize) {
		for (let bx = 0; bx < width; bx += blockSize) {
			const blockWidth = Math.min(blockSize, width - bx);
			const blockHeight = Math.min(blockSize, height - by);
			const [r, g, b, a] = averageBlock(pixels, bx, by, blockWidth, blockHeight);

			for (let y = by; y < by + blockHeight; y++) {
				for (let x = bx; x < bx + blockWidth; x++) {
					const i = (y * width + x) * 4;
					out[i] = r;
					out[i + 1] = g;
					out[i + 2] = b;
					out[i + 3] = a;
				}
			}
		}
	}

	return { width, height, data: out };
}

function averageBlock(pixels: Pixels, bx: number, by: number, blockWidth: number, blockHeight: number): [number, number, number, number] {
	const { width, data } = pixels;
	let r = 0;
	let g = 0;
	let b = 0;
	let a = 0;
	const count = blockWidth * blockHeight;

	for (let y = by; y < by + blockHeight; y++) {
		for (let x = bx; x < bx + blockWidth; x++) {
			const i = (y * width + x) * 4;
			r += data[i];
			g += data[i + 1];
			b += data[i + 2];
			a += data[i + 3];
		}
	}

	return [Math.round(r / count), Math.round(g / count), Math.round(b / count), Math.round(a / count)];
}
