import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'radius', label: 'Raggio', kind: 'range', min: 1, max: 20, step: 0.5, default: 4.5 },
	{ name: 'rings', label: 'Anelli', kind: 'range', min: 1, max: 6, step: 1, default: 1 },
	{ name: 'itemsPerRing', label: 'Media per anello', kind: 'range', min: 3, max: 24, step: 1, default: 8 },
	{ name: 'ringGap', label: 'Distanza tra anelli', kind: 'range', min: 0.2, max: 8, step: 0.1, default: 2.2 },
	{ name: 'spinSpeed', label: 'Velocità rotazione', kind: 'range', min: -2, max: 2, step: 0.05, default: 0.08 },
	{ name: 'wave', label: 'Moto verticale', kind: 'range', min: 0, max: 3, step: 0.05, default: 0.15 },
	{ name: 'pitch', label: 'Inclinazione card', kind: 'range', min: -30, max: 30, step: 1, default: -3 },
	{ name: 'scale', label: 'Scala', kind: 'range', min: 0.4, max: 4, step: 0.05, default: 1.1 }
];

const FULL_TURN = Math.PI * 2;
const DEGREES_TO_RADIANS = Math.PI / 180;

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	if (count <= 0) {
		return [];
	}

	const values = clampParams(params, rawParams);
	const radius = Number(values.radius);
	const rings = Math.round(Number(values.rings));
	const ringGap = Number(values.ringGap);
	const spin = Number(values.spinSpeed) * t * FULL_TURN;
	const wave = Number(values.wave);
	const pitch = Number(values.pitch) * DEGREES_TO_RADIANS;
	const scale = Number(values.scale);

	return Array.from({ length: count }, (_, index) => {
		const ring = index % rings;
		const ringCount = Math.ceil((count - ring) / rings);
		const ringIndex = Math.floor(index / rings);
		const angle = (ringIndex / ringCount) * FULL_TURN + spin * (ring % 2 === 0 ? 1 : -0.7) + ring * 0.35;
		const height = (ring - (rings - 1) / 2) * ringGap;

		return {
			position: {
				x: Math.sin(angle) * radius,
				y: height + Math.sin(angle * 2 + t * FULL_TURN) * wave,
				z: Math.cos(angle) * radius
			},
			rotation: { x: pitch, y: angle, z: 0 },
			scale: { x: scale, y: scale, z: scale }
		};
	});
}
