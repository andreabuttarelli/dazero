import type { Pixels } from './types';

export function apply(pixels: Pixels, params: Record<string, number | string>): Pixels {
	const shadow = hexToRgb(String(params.shadow ?? '#000000'));
	const highlight = hexToRgb(String(params.highlight ?? '#ffffff'));
	const out = new Uint8ClampedArray(pixels.data.length);

	for (let i = 0; i < pixels.data.length; i += 4) {
		const luminance = (0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]) / 255;
		out[i] = Math.round(shadow[0] + (highlight[0] - shadow[0]) * luminance);
		out[i + 1] = Math.round(shadow[1] + (highlight[1] - shadow[1]) * luminance);
		out[i + 2] = Math.round(shadow[2] + (highlight[2] - shadow[2]) * luminance);
		out[i + 3] = pixels.data[i + 3];
	}

	return { width: pixels.width, height: pixels.height, data: out };
}

function hexToRgb(hex: string): [number, number, number] {
	const normalized = hex.replace('#', '');
	return [
		parseInt(normalized.slice(0, 2), 16),
		parseInt(normalized.slice(2, 4), 16),
		parseInt(normalized.slice(4, 6), 16)
	];
}
