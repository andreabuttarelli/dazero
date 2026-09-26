import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const strength = Number(params.strength) || 0;
	const radius = Math.max(1, Number(params.radius) || 1);
	const { width, height, data } = pixels;
	const out = new Uint8ClampedArray(data.length);
	const centerX = width / 2;
	const centerY = height / 2;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [srcX, srcY] = swirlSource(x, y, centerX, centerY, radius, strength);
			const dstI = (y * width + x) * 4;
			const clampedX = clamp(Math.round(srcX), 0, width - 1);
			const clampedY = clamp(Math.round(srcY), 0, height - 1);
			const srcI = (clampedY * width + clampedX) * 4;
			out[dstI] = data[srcI];
			out[dstI + 1] = data[srcI + 1];
			out[dstI + 2] = data[srcI + 2];
			out[dstI + 3] = data[srcI + 3];
		}
	}

	return { width, height, data: out };
}

function swirlSource(x: number, y: number, centerX: number, centerY: number, radius: number, strength: number): [number, number] {
	const dx = x - centerX;
	const dy = y - centerY;
	const distance = Math.sqrt(dx * dx + dy * dy);

	if (distance >= radius || strength === 0) {
		return [x, y];
	}

	const factor = 1 - distance / radius;
	const angle = strength * factor * factor;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	return [centerX + dx * cos - dy * sin, centerY + dx * sin + dy * cos];
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
