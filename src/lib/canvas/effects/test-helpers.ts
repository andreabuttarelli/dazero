import type { Pixels } from './types';

export function makePixels(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): Pixels {
	const data = new Uint8ClampedArray(width * height * 4);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [r, g, b, a] = fill(x, y);
			const i = (y * width + x) * 4;
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = a;
		}
	}

	return { width, height, data };
}

export function pixelAt(pixels: Pixels, x: number, y: number): [number, number, number, number] {
	const i = (y * pixels.width + x) * 4;
	return [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2], pixels.data[i + 3]];
}
