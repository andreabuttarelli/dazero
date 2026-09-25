import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'radius', label: 'Raggio', kind: 'range', min: 1, max: 20, step: 0.5, default: 6 },
	{ name: 'frontScale', label: 'Scala frontale', kind: 'range', min: 0.5, max: 3, step: 0.05, default: 1.5 },
	{ name: 'backScale', label: 'Scala posteriore', kind: 'range', min: 0.1, max: 2, step: 0.05, default: 0.7 },
	{ name: 'depth', label: 'Profondità', kind: 'range', min: 0, max: 10, step: 0.5, default: 3 },
	{ name: 'rotationSpeed', label: 'Velocità rotazione', kind: 'range', min: 0, max: 2, step: 0.05, default: 0.2 },
	{ name: 'pauseStrength', label: 'Sosta per elemento', kind: 'range', min: 0, max: 1, step: 0.05, default: 0.4 }
];

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	if (count <= 0) {
		return [];
	}

	const clamped = clampParams(params, rawParams);
	const radius = Number(clamped.radius);
	const frontScale = Number(clamped.frontScale);
	const backScale = Number(clamped.backScale);
	const depth = Number(clamped.depth);
	const rotationSpeed = Number(clamped.rotationSpeed);
	const pauseStrength = Number(clamped.pauseStrength);

	const baseAngle = rotationSpeed * t * Math.PI * 2;
	const step = (Math.PI * 2) / count;

	const items: Transform[] = [];
	for (let index = 0; index < count; index++) {
		const rawAngle = baseAngle + index * step;
		const angle = easeStop(rawAngle, step, pauseStrength);
		const front = (Math.cos(angle) + 1) / 2;
		const scale = backScale + (frontScale - backScale) * front;

		items.push({
			position: {
				x: Math.sin(angle) * radius,
				y: 0,
				z: Math.cos(angle) * depth
			},
			rotation: { x: 0, y: -angle, z: 0 },
			scale: { x: scale, y: scale, z: scale }
		});
	}

	return items;
}

function easeStop(angle: number, step: number, pauseStrength: number): number {
	if (pauseStrength <= 0) {
		return angle;
	}

	const nearestStep = Math.round(angle / step) * step;
	const fraction = (angle - nearestStep) / (step / 2);
	const eased = Math.sign(fraction) * Math.pow(Math.abs(fraction), 1 + pauseStrength * 3);
	return nearestStep + eased * (step / 2);
}
