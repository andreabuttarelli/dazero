import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'slots', label: 'Numero media', kind: 'range', min: 3, max: 24, step: 1, default: 7 },
	{ name: 'radius', label: 'Raggio', kind: 'range', min: 1, max: 20, step: 0.5, default: 4.5 },
	{ name: 'frontScale', label: 'Scala frontale', kind: 'range', min: 0.5, max: 3, step: 0.05, default: 1.8 },
	{ name: 'backScale', label: 'Scala posteriore', kind: 'range', min: 0.1, max: 2, step: 0.05, default: 0.7 },
	{ name: 'depth', label: 'Profondità', kind: 'range', min: 0, max: 10, step: 0.5, default: 2.5 },
	{ name: 'rotationSpeed', label: 'Giri per loop', kind: 'range', min: -3, max: 3, step: 1, default: 1 },
	{ name: 'pauseStrength', label: 'Fuoco frontale', kind: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
	{ name: 'verticalWave', label: 'Ventaglio verticale', kind: 'range', min: 0, max: 8, step: 0.1, default: 1.2 },
	{ name: 'cardTilt', label: 'Inclinazione media', kind: 'range', min: -30, max: 30, step: 1, default: -6 }
];

const DEGREES_TO_RADIANS = Math.PI / 180;

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	if (count <= 0) {
		return [];
	}

	const clamped = clampParams(params, rawParams);
	const radius = Number(clamped.radius);
	const frontScale = Number(clamped.frontScale);
	const backScale = Number(clamped.backScale);
	const depth = Number(clamped.depth);
	const rawCycles = Number(clamped.rotationSpeed);
	const cycles = rawCycles !== 0 && Math.abs(rawCycles) < 0.5 ? Math.sign(rawCycles) : Math.round(rawCycles);
	const pauseStrength = Number(clamped.pauseStrength);
	const verticalWave = Number(clamped.verticalWave);
	const cardTilt = Number(clamped.cardTilt) * DEGREES_TO_RADIANS;

	const cycle = ((t * cycles) % 1 + 1) % 1;
	const baseAngle = -cycle * Math.PI * 2;
	const step = (Math.PI * 2) / count;

	const items: Transform[] = [];
	for (let index = 0; index < count; index++) {
		const angle = baseAngle + index * step;
		const facing = Math.cos(angle);
		const front = Math.pow((facing + 1) / 2, 1 + pauseStrength * 2);
		const scale = backScale + (frontScale - backScale) * front;

		items.push({
			position: {
				x: Math.sin(angle) * radius,
				y: Math.sin(angle * 2) * verticalWave * 0.25,
				z: Math.cos(angle) * depth
			},
			rotation: { x: cardTilt * (0.4 + front * 0.6), y: angle, z: Math.sin(angle) * cardTilt },
			scale: { x: scale, y: scale, z: scale },
			opacity: facing <= 0 ? 0 : Math.pow(facing, 0.6)
		});
	}

	return items;
}
