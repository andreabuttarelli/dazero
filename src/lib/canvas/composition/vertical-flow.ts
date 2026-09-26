import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'items', label: 'Numero media', kind: 'range', min: 3, max: 20, step: 1, default: 5 },
	{ name: 'gap', label: 'Spaziatura verticale', kind: 'range', min: 0.5, max: 8, step: 0.1, default: 1.7 },
	{ name: 'depth', label: 'Profondità', kind: 'range', min: 0, max: 8, step: 0.1, default: 0.9 },
	{ name: 'focusScale', label: 'Scala protagonista', kind: 'range', min: 0.5, max: 4, step: 0.05, default: 2.2 },
	{ name: 'edgeScale', label: 'Scala ai bordi', kind: 'range', min: 0.1, max: 2, step: 0.05, default: 0.95 },
	{ name: 'tilt', label: 'Inclinazione', kind: 'range', min: 0, max: 45, step: 1, default: 12 },
	{ name: 'speed', label: 'Giri per loop', kind: 'range', min: -3, max: 3, step: 1, default: 1 },
	{ name: 'drift', label: 'Deriva laterale', kind: 'range', min: 0, max: 4, step: 0.1, default: 0.25 }
];

const DEGREES_TO_RADIANS = Math.PI / 180;

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	if (count <= 0) {
		return [];
	}

	const values = clampParams(params, rawParams);
	const gap = Number(values.gap);
	const depth = Number(values.depth);
	const focusScale = Number(values.focusScale);
	const edgeScale = Number(values.edgeScale);
	const tilt = Number(values.tilt) * DEGREES_TO_RADIANS;
	const cycles = Math.round(Number(values.speed));
	const drift = Number(values.drift);
	const cycle = ((t * cycles) % 1 + 1) % 1;
	const half = count / 2;

	return Array.from({ length: count }, (_, index) => {
		const slot = wrapped(index - cycle * count, count);
		const distance = Math.min(1, Math.abs(slot) / half);
		const focus = Math.pow(1 - distance, 1.5);
		const scale = edgeScale + (focusScale - edgeScale) * focus;

		return {
			position: {
				x: Math.sin(slot * Math.PI / half) * drift,
				y: -slot * gap,
				z: -distance * depth
			},
			rotation: { x: Math.sign(slot) * tilt * Math.min(1, Math.abs(slot)), y: 0, z: 0 },
			scale: { x: scale, y: scale, z: scale },
			opacity: edgeOpacity(distance)
		};
	});
}

function wrapped(value: number, count: number): number {
	const half = count / 2;
	return ((value + half) % count + count) % count - half;
}

function edgeOpacity(distance: number): number {
	const progress = Math.min(1, Math.max(0, (distance - 0.72) / 0.28));
	return 1 - progress * progress * (3 - 2 * progress);
}
