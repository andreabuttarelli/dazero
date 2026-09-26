import { GLYPH_SIZE, glyphFor } from './ascii-font';
import type { Pixels } from './types';

const CHARSETS: Record<string, string> = {
	default: ' .:-+#@',
	blocks: ' .:%#@',
	minimal: ' .@'
};

const MONO_INK: [number, number, number] = [0, 0, 0];
const MONO_PAPER: [number, number, number] = [255, 255, 255];

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const cellSize = Math.max(GLYPH_SIZE, Math.round(Number(params.cellSize) || GLYPH_SIZE));
	const charset = CHARSETS[String(params.charset ?? 'default')] ?? CHARSETS.default;
	const mono = String(params.mode ?? 'mono') === 'mono';
	const { width, height } = pixels;
	const out = new Uint8ClampedArray(pixels.data.length).fill(mono ? MONO_PAPER[0] : 0);

	if (mono) {
		for (let i = 3; i < out.length; i += 4) {
			out[i] = 255;
		}
	}

	for (let cy = 0; cy < height; cy += cellSize) {
		for (let cx = 0; cx < width; cx += cellSize) {
			paintCell(pixels, out, cx, cy, cellSize, charset, mono);
		}
	}

	return { width, height, data: out };
}

function paintCell(pixels: Pixels, out: Uint8ClampedArray, cx: number, cy: number, cellSize: number, charset: string, mono: boolean): void {
	const { width, height, data } = pixels;
	const cellWidth = Math.min(cellSize, width - cx);
	const cellHeight = Math.min(cellSize, height - cy);
	let luminanceSum = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let alphaSum = 0;
	const count = cellWidth * cellHeight;

	for (let y = cy; y < cy + cellHeight; y++) {
		for (let x = cx; x < cx + cellWidth; x++) {
			const i = (y * width + x) * 4;
			r += data[i];
			g += data[i + 1];
			b += data[i + 2];
			alphaSum += data[i + 3];
			luminanceSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
		}
	}

	const luminance = luminanceSum / count / 255;
	const charIndex = Math.min(charset.length - 1, Math.floor((1 - luminance) * charset.length));
	const glyph = glyphFor(charset[charIndex]);
	const alpha = Math.round(alphaSum / count);
	const inkColor: [number, number, number] = mono ? MONO_INK : [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
	const paperColor: [number, number, number] = mono ? MONO_PAPER : [255, 255, 255];

	for (let y = cy; y < cy + cellHeight; y++) {
		for (let x = cx; x < cx + cellWidth; x++) {
			const gx = Math.floor(((x - cx) / cellSize) * GLYPH_SIZE);
			const gy = Math.floor(((y - cy) / cellSize) * GLYPH_SIZE);
			const lit = glyph[Math.min(GLYPH_SIZE - 1, gy)][Math.min(GLYPH_SIZE - 1, gx)] === '1';
			const color = lit ? inkColor : paperColor;
			const i = (y * width + x) * 4;
			out[i] = color[0];
			out[i + 1] = color[1];
			out[i + 2] = color[2];
			out[i + 3] = alpha;
		}
	}
}
