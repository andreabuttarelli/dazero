export type EffectId =
	| 'pixelate'
	| 'posterize'
	| 'random-colors'
	| 'hue-saturation'
	| 'duotone'
	| 'dither'
	| 'halftone'
	| 'noise'
	| 'rgb-shift'
	| 'glitch'
	| 'wave'
	| 'swirl'
	| 'pinch'
	| 'ascii';

export type EffectParam =
	| { name: string; label: string; kind: 'range'; min: number; max: number; step: number; default: number }
	| { name: string; label: string; kind: 'select'; options: { value: string; label: string }[]; default: string }
	| { name: string; label: string; kind: 'color'; default: string }
	| { name: string; label: string; kind: 'seed'; default: number };

export type EffectStep = {
	id: EffectId;
	params: Record<string, number | string>;
};

export type Pixels = {
	width: number;
	height: number;
	data: Uint8ClampedArray;
};
