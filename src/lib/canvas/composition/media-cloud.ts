import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'density', label: 'Densità media', kind: 'range', min: 3, max: 30, step: 1, default: 7 },
	{ name: 'spreadX', label: 'Ampiezza', kind: 'range', min: 1, max: 30, step: 0.5, default: 7 },
	{ name: 'spreadY', label: 'Altezza', kind: 'range', min: 1, max: 30, step: 0.5, default: 7 },
	{ name: 'spreadZ', label: 'Profondità', kind: 'range', min: 0, max: 30, step: 0.5, default: 5 },
	{ name: 'scaleMin', label: 'Scala minima', kind: 'range', min: 0.4, max: 3, step: 0.05, default: 1 },
	{ name: 'scaleMax', label: 'Scala massima', kind: 'range', min: 0.1, max: 4, step: 0.05, default: 1.6 },
	{ name: 'drift', label: 'Deriva', kind: 'range', min: 0, max: 3, step: 0.05, default: 0.35 },
	{ name: 'seed', label: 'Distribuzione', kind: 'seed', default: 42 }
];

const FULL_TURN = Math.PI * 2;

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	const values = clampParams(params, rawParams);
	const random = seeded(Number(values.seed));
	const spreadX = Number(values.spreadX);
	const spreadY = Number(values.spreadY);
	const spreadZ = Number(values.spreadZ);
	const scaleMin = Math.min(Number(values.scaleMin), Number(values.scaleMax));
	const scaleMax = Math.max(Number(values.scaleMin), Number(values.scaleMax));
	const drift = Number(values.drift);
	const items: Transform[] = [];

	for (let index = 0; index < count; index++) {
		const baseX = centered(random()) * spreadX;
		const baseY = centered(random()) * spreadY;
		const baseZ = centered(random()) * spreadZ;
		const phase = random() * FULL_TURN;
		const speed = 0.35 + random() * 0.65;
		const scale = scaleMin + random() * (scaleMax - scaleMin);

		items.push({
			position: {
				x: baseX + Math.sin(t * speed + phase) * drift,
				y: baseY + Math.cos(t * speed * 0.7 + phase) * drift,
				z: baseZ + Math.sin(t * speed * 0.5 + phase) * drift
			},
			rotation: { x: 0, y: centered(random()) * 0.5, z: centered(random()) * 0.25 },
			scale: { x: scale, y: scale, z: scale }
		});
	}

	return items;
}

function centered(value: number): number {
	return value - 0.5;
}

function seeded(seed: number): () => number {
	let state = Math.trunc(seed) >>> 0;

	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}
