import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const hueShift = Number(params.hue) || 0;
	const saturationScale = params.saturation === undefined ? 1 : Number(params.saturation);
	const out = new Uint8ClampedArray(pixels.data.length);

	for (let i = 0; i < pixels.data.length; i += 4) {
		const [h, s, l] = rgbToHsl(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
		const shiftedHue = (((h + hueShift) % 360) + 360) % 360;
		const scaledSaturation = Math.min(1, Math.max(0, s * saturationScale));
		const [r, g, b] = hslToRgb(shiftedHue, scaledSaturation, l);
		out[i] = r;
		out[i + 1] = g;
		out[i + 2] = b;
		out[i + 3] = pixels.data[i + 3];
	}

	return { width: pixels.width, height: pixels.height, data: out };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;

	if (max === min) {
		return [0, 0, l];
	}

	const delta = max - min;
	const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let h: number;

	if (max === rn) {
		h = ((gn - bn) / delta) % 6;
	} else if (max === gn) {
		h = (bn - rn) / delta + 2;
	} else {
		h = (rn - gn) / delta + 4;
	}

	h *= 60;
	if (h < 0) {
		h += 360;
	}

	return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) {
		const v = Math.round(l * 255);
		return [v, v, v];
	}

	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let [r, g, b] = [0, 0, 0];

	if (h < 60) {
		[r, g, b] = [c, x, 0];
	} else if (h < 120) {
		[r, g, b] = [x, c, 0];
	} else if (h < 180) {
		[r, g, b] = [0, c, x];
	} else if (h < 240) {
		[r, g, b] = [0, x, c];
	} else if (h < 300) {
		[r, g, b] = [x, 0, c];
	} else {
		[r, g, b] = [c, 0, x];
	}

	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
