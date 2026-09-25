import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'columns', label: 'Colonne', kind: 'range', min: 1, max: 12, step: 1, default: 4 },
	{ name: 'gapX', label: 'Spaziatura orizzontale', kind: 'range', min: 0.1, max: 10, step: 0.1, default: 2 },
	{ name: 'gapY', label: 'Spaziatura verticale', kind: 'range', min: 0.1, max: 10, step: 0.1, default: 2 },
	{ name: 'tiltX', label: 'Inclinazione X', kind: 'range', min: -45, max: 45, step: 1, default: 0 },
	{ name: 'tiltY', label: 'Inclinazione Y', kind: 'range', min: -45, max: 45, step: 1, default: 0 },
	{ name: 'tiltZ', label: 'Inclinazione Z', kind: 'range', min: -45, max: 45, step: 1, default: 0 },
	{ name: 'scrollSpeed', label: 'Velocità scorrimento', kind: 'range', min: 0, max: 5, step: 0.1, default: 0 },
	{
		name: 'scrollDirection',
		label: 'Direzione scorrimento',
		kind: 'select',
		options: [
			{ value: 'vertical', label: 'Verticale' },
			{ value: 'horizontal', label: 'Orizzontale' }
		],
		default: 'vertical'
	}
];

const DEGREES_TO_RADIANS = Math.PI / 180;

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	if (count <= 0) {
		return [];
	}

	const clamped = clampParams(params, rawParams);
	const columns = Math.max(1, Math.round(Number(clamped.columns)));
	const gapX = Number(clamped.gapX);
	const gapY = Number(clamped.gapY);
	const tiltX = Number(clamped.tiltX) * DEGREES_TO_RADIANS;
	const tiltY = Number(clamped.tiltY) * DEGREES_TO_RADIANS;
	const tiltZ = Number(clamped.tiltZ) * DEGREES_TO_RADIANS;
	const scrollSpeed = Number(clamped.scrollSpeed);
	const scrollDirection = String(clamped.scrollDirection);
	const rows = Math.ceil(count / columns);

	const originX = -((columns - 1) * gapX) / 2;
	const originY = ((rows - 1) * gapY) / 2;
	const scroll = scrollSpeed * t;

	const items: Transform[] = [];
	for (let index = 0; index < count; index++) {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const x = originX + column * gapX + (scrollDirection === 'horizontal' ? scroll : 0);
		const y = originY - row * gapY - (scrollDirection === 'vertical' ? scroll : 0);

		items.push({
			position: { x, y, z: 0 },
			rotation: { x: tiltX, y: tiltY, z: tiltZ },
			scale: { x: 1, y: 1, z: 1 }
		});
	}

	return items;
}
