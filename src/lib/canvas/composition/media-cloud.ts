import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'density', label: 'Densità media', kind: 'range', min: 3, max: 9, step: 1, default: 7 },
	{ name: 'spreadX', label: 'Ampiezza', kind: 'range', min: 1, max: 12, step: 0.5, default: 7 },
	{ name: 'spreadY', label: 'Altezza', kind: 'range', min: 1, max: 12, step: 0.5, default: 6 },
	{ name: 'spreadZ', label: 'Profondità', kind: 'range', min: 0, max: 8, step: 0.5, default: 3 },
	{ name: 'scaleMin', label: 'Scala lontana', kind: 'range', min: 0.4, max: 2, step: 0.05, default: 0.8 },
	{ name: 'scaleMax', label: 'Scala vicina', kind: 'range', min: 0.5, max: 2.5, step: 0.05, default: 1.3 },
	{ name: 'drift', label: 'Movimento', kind: 'range', min: 0, max: 1.5, step: 0.05, default: 0.45 },
	{ name: 'seed', label: 'Distribuzione', kind: 'seed', default: 42 }
];

const FULL_TURN = Math.PI * 2;
const LANE_COUNT = 3;
const CARD_TILT = 0.06;
const LANE_SPACING = 0.28;
const DEPTH_ORIGIN = -0.5;
const DEPTH_DRIFT = 0.6;
const SEED_CYCLE = 997;

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	const values = clampParams(params, rawParams);
	const spreadX = Number(values.spreadX);
	const spreadY = Number(values.spreadY);
	const spreadZ = Number(values.spreadZ);
	const scaleMin = Math.min(Number(values.scaleMin), Number(values.scaleMax));
	const scaleMax = Math.max(Number(values.scaleMin), Number(values.scaleMax));
	const drift = Number(values.drift);
	const seedOffset = normalizedSeed(Number(values.seed));
	const laneOffset = Math.floor(seedOffset * LANE_COUNT);
	const laneCenter = averageLane(count, laneOffset);
	const items: Transform[] = [];

	for (let index = 0; index < count; index++) {
		const phase = FULL_TURN * (t + index / Math.max(1, count) + seedOffset);
		const lane = laneAt(index, laneOffset) - laneCenter;
		const depthLayer = (index + laneOffset) % LANE_COUNT;
		const depthRatio = depthLayer / (LANE_COUNT - 1);
		const scale = scaleMax - depthRatio * (scaleMax - scaleMin);

		items.push({
			position: {
				x: Math.sin(phase) * spreadX * 0.5,
				y: lane * spreadY * LANE_SPACING + Math.sin(phase * 2) * drift,
				z: DEPTH_ORIGIN - depthRatio * spreadZ + Math.cos(phase) * drift * DEPTH_DRIFT
			},
			rotation: {
				x: Math.sin(phase * 2) * CARD_TILT,
				y: Math.cos(phase) * CARD_TILT,
				z: Math.sin(phase) * CARD_TILT
			},
			scale: { x: scale, y: scale, z: scale }
		});
	}

	return items;
}

function laneAt(index: number, offset: number): number {
	return (index + offset) % LANE_COUNT - 1;
}

function averageLane(count: number, offset: number): number {
	if (count === 0) {
		return 0;
	}

	let total = 0;
	for (let index = 0; index < count; index++) {
		total += laneAt(index, offset);
	}

	return total / count;
}

function normalizedSeed(seed: number): number {
	return (Math.abs(Math.trunc(seed)) % SEED_CYCLE) / SEED_CYCLE;
}
