import type { LayoutParam, LayoutParams } from './composition/types';
import type { CameraPresetId } from './composition/camera';
import type { CompositionAspect } from './composition-node';

export type Control =
	| { kind: 'slider'; min: number; max: number; step: number; value: number }
	| { kind: 'select'; options: { value: string; label: string }[]; value: string }
	| { kind: 'color'; value: string }
	| { kind: 'seed'; value: number };

type ParamOfKind<K extends LayoutParam['kind']> = Extract<LayoutParam, { kind: K }>;

const CONTROLS: { [K in LayoutParam['kind']]: (param: ParamOfKind<K>, value: unknown) => Control } = {
	range: (param, value) => ({
		kind: 'slider',
		min: param.min,
		max: param.max,
		step: param.step,
		value: typeof value === 'number' ? value : param.default
	}),
	select: (param, value) => ({
		kind: 'select',
		options: param.options,
		value: param.options.some((option) => option.value === value) ? (value as string) : param.default
	}),
	color: (param, value) => ({ kind: 'color', value: typeof value === 'string' ? value : param.default }),
	seed: (param, value) => ({ kind: 'seed', value: typeof value === 'number' ? value : param.default })
};

export function controlFor(param: LayoutParam, value: unknown): Control {
	const build = CONTROLS[param.kind] as (param: LayoutParam, value: unknown) => Control;
	return build(param, value);
}

export function setLayoutParam(params: LayoutParams, name: string, value: number | string): LayoutParams {
	return { ...params, [name]: value };
}

export type CompositionEditorState = {
	layout: string;
	layoutParams: LayoutParams;
	cameraPreset: CameraPresetId;
	cameraParams: LayoutParams;
	backgroundColor: string;
	duration: number;
	aspect: CompositionAspect;
};

export function defaultParamsFor(defs: readonly { name: string; default: number | string }[]): LayoutParams {
	return Object.fromEntries(defs.map((def) => [def.name, def.default]));
}

const MIN_DURATION_SECONDS = 0.5;
const KNOB_SWEEP_DEGREES = 270;
const KNOB_DRAG_PIXELS = 180;

export function clampDuration(value: number): number {
	return Math.max(MIN_DURATION_SECONDS, value);
}

export function knobAngle(value: number, min: number, max: number): number {
	const progress = max === min ? 0 : (clamp(value, min, max) - min) / (max - min);
	return progress * KNOB_SWEEP_DEGREES - KNOB_SWEEP_DEGREES / 2;
}

export function knobValueFromDrag(
	start: number,
	deltaX: number,
	deltaY: number,
	min: number,
	max: number,
	step: number
): number {
	const delta = (deltaX - deltaY) / KNOB_DRAG_PIXELS * (max - min);
	return snapKnob(start + delta, min, max, step);
}

export function stepKnob(value: number, direction: -1 | 1, min: number, max: number, step: number): number {
	return snapKnob(value + direction * step, min, max, step);
}

function snapKnob(value: number, min: number, max: number, step: number): number {
	const snapped = min + Math.round((clamp(value, min, max) - min) / step) * step;
	const decimals = Math.max(0, decimalPlaces(step));
	return Number(clamp(snapped, min, max).toFixed(decimals));
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function decimalPlaces(value: number): number {
	const text = String(value);
	return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}
