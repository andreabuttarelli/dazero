import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'items', label: 'Numero media', kind: 'range', min: 3, max: 30, step: 1, default: 7 },
	{ name: 'radius', label: 'Raggio', kind: 'range', min: 1, max: 20, step: 0.5, default: 3 },
	{ name: 'height', label: 'Altezza', kind: 'range', min: 1, max: 40, step: 0.5, default: 5 },
	{ name: 'turns', label: 'Giri', kind: 'range', min: 0.5, max: 8, step: 0.25, default: 2 },
	{ name: 'spinSpeed', label: 'Velocità rotazione', kind: 'range', min: -2, max: 2, step: 0.05, default: 0.12 },
	{ name: 'scale', label: 'Scala', kind: 'range', min: 0.1, max: 4, step: 0.05, default: 0.9 },
	{ name: 'pulse', label: 'Pulsazione', kind: 'range', min: 0, max: 1.5, step: 0.05, default: 0.1 }
];

const FULL_TURN = Math.PI * 2;

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	if (count <= 0) {
		return [];
	}

	const values = clampParams(params, rawParams);
	const radius = Number(values.radius);
	const height = Number(values.height);
	const turns = Number(values.turns);
	const spin = Number(values.spinSpeed) * t * FULL_TURN;
	const scale = Number(values.scale);
	const pulse = Number(values.pulse);
	const lastIndex = Math.max(1, count - 1);

	return Array.from({ length: count }, (_, index) => {
		const progress = index / lastIndex;
		const angle = index / count * turns * FULL_TURN + spin;
		const cardScale = scale * (1 + Math.sin(angle * 1.5 - t * FULL_TURN) * pulse);

		return {
			position: {
				x: Math.sin(angle) * radius,
				y: (progress - 0.5) * height,
				z: Math.cos(angle) * radius
			},
			rotation: { x: 0, y: Math.sin(angle) * 0.18, z: 0 },
			scale: { x: cardScale, y: cardScale, z: cardScale }
		};
	});
}
