import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const amplitude = Number(params.amplitude) || 0;
	const frequency = Number(params.frequency) || 1;
	const direction = String(params.direction ?? 'horizontal');
	const { width, height, data } = pixels;
	const out = new Uint8ClampedArray(data.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [srcX, srcY] = sourceCoords(x, y, width, height, amplitude, frequency, direction);
			const dstI = (y * width + x) * 4;
			const srcI = (clamp(srcY, 0, height - 1) * width + clamp(srcX, 0, width - 1)) * 4;
			out[dstI] = data[srcI];
			out[dstI + 1] = data[srcI + 1];
			out[dstI + 2] = data[srcI + 2];
			out[dstI + 3] = data[srcI + 3];
		}
	}

	return { width, height, data: out };
}

function sourceCoords(x: number, y: number, width: number, height: number, amplitude: number, frequency: number, direction: string): [number, number] {
	if (direction === 'vertical') {
		const offset = Math.round(Math.sin((x / width) * Math.PI * 2 * frequency) * amplitude);
		return [x, Math.round(y + offset)];
	}

	const offset = Math.round(Math.sin((y / height) * Math.PI * 2 * frequency) * amplitude);
	return [Math.round(x + offset), y];
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
