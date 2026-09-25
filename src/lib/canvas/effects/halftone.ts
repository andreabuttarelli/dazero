import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const dotSize = Math.max(2, Math.round(Number(params.dotSize) || 4));
	const { width, height, data } = pixels;
	const out = new Uint8ClampedArray(data.length).fill(255);

	for (let i = 3; i < out.length; i += 4) {
		out[i] = 0;
	}

	for (let cy = 0; cy < height; cy += dotSize) {
		for (let cx = 0; cx < width; cx += dotSize) {
			paintCell(pixels, out, cx, cy, dotSize);
		}
	}

	return { width, height, data: out };
}

function paintCell(pixels: Pixels, out: Uint8ClampedArray, cx: number, cy: number, dotSize: number): void {
	const { width, height, data } = pixels;
	const cellWidth = Math.min(dotSize, width - cx);
	const cellHeight = Math.min(dotSize, height - cy);
	let luminanceSum = 0;
	let alphaSum = 0;
	const count = cellWidth * cellHeight;

	for (let y = cy; y < cy + cellHeight; y++) {
		for (let x = cx; x < cx + cellWidth; x++) {
			const i = (y * width + x) * 4;
			luminanceSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
			alphaSum += data[i + 3];
		}
	}

	const darkness = 1 - luminanceSum / count / 255;
	const radius = (Math.sqrt(darkness) * dotSize) / 2;
	const centerX = cx + cellWidth / 2;
	const centerY = cy + cellHeight / 2;
	const alpha = Math.round(alphaSum / count);

	for (let y = cy; y < cy + cellHeight; y++) {
		for (let x = cx; x < cx + cellWidth; x++) {
			const dx = x + 0.5 - centerX;
			const dy = y + 0.5 - centerY;
			const inside = Math.sqrt(dx * dx + dy * dy) <= radius;
			const i = (y * width + x) * 4;
			const value = inside ? 0 : 255;
			out[i] = value;
			out[i + 1] = value;
			out[i + 2] = value;
			out[i + 3] = alpha;
		}
	}
}
