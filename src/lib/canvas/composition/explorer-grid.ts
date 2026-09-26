import { clampParams } from './clamp';
import type { CameraState } from './camera';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
	{ name: 'columns', label: 'Colonne', kind: 'range', min: 2, max: 3, step: 1, default: 3 },
	{ name: 'rows', label: 'Righe', kind: 'range', min: 2, max: 3, step: 1, default: 3 },
	{ name: 'gapX', label: 'Spazio orizzontale', kind: 'range', min: 1, max: 4, step: 0.1, default: 1.8 },
	{ name: 'gapY', label: 'Spazio verticale', kind: 'range', min: 1, max: 5, step: 0.1, default: 2.1 },
	{ name: 'stops', label: 'Focus per loop', kind: 'range', min: 2, max: 8, step: 1, default: 4 },
	{ name: 'pause', label: 'Sosta', kind: 'range', min: 0, max: 0.7, step: 0.05, default: 0.25 },
	{ name: 'scale', label: 'Scala media', kind: 'range', min: 0.5, max: 2, step: 0.05, default: 1.05 },
	{ name: 'focusScale', label: 'Zoom focus', kind: 'range', min: 1, max: 2, step: 0.05, default: 1.25 },
	{ name: 'seed', label: 'Percorso', kind: 'seed', default: 17 }
];

const DIRECTIONS = [
	{ x: 1, y: 0 },
	{ x: 0, y: 1 },
	{ x: -1, y: 0 },
	{ x: 0, y: -1 }
];
const DEPTH_LIFT = 0.35;
const EDGE_FADE_START = 0.72;
const EASE_EXPONENT = 3;
export const GRID_BUFFER_CELLS = 2;
const RENDER_COLUMNS = '__renderColumns';
const RENDER_ROWS = '__renderRows';

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
	if (count <= 0) {
		return [];
	}

	const values = clampParams(params, rawParams);
	const visibleColumns = Math.round(Number(values.columns));
	const visibleRows = Math.round(Number(values.rows));
	const columns = renderSize(rawParams, RENDER_COLUMNS, visibleColumns);
	const rows = renderSize(rawParams, RENDER_ROWS, visibleRows);
	const gapX = Number(values.gapX);
	const gapY = Number(values.gapY);
	const stops = Math.round(Number(values.stops));
	const pause = Number(values.pause);
	const scale = Number(values.scale);
	const focusScale = Number(values.focusScale);
	const route = makeRoute(stops, Number(values.seed));
	const phase = modulo(t, 1) * stops;
	const segment = Math.floor(phase) % stops;
	const progress = travelProgress(phase - Math.floor(phase), pause);
	const camera = interpolate(route[segment], route[(segment + 1) % stops], progress);
	const zoom = 1 + Math.abs(progress * 2 - 1) * (focusScale - 1);
	const width = columns * gapX;
	const height = rows * gapY;
	const visibleWidth = (columns - GRID_BUFFER_CELLS) * gapX;
	const visibleHeight = (rows - GRID_BUFFER_CELLS) * gapY;

	return Array.from({ length: count }, (_, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns) % rows;
		const cellX = column - Math.floor(columns / 2);
		const cellY = row - Math.floor(rows / 2);
		const gridX = wrap((cellX - camera.x) * gapX, width);
		const gridY = wrap((cellY - camera.y) * gapY, height);
		const x = gridX * zoom;
		const y = gridY * zoom;
		const distance = Math.hypot(x / gapX, y / gapY);
		const focus = Math.max(0, 1 - distance);
		const cardScale = scale * zoom;

		return {
			position: { x, y, z: focus * DEPTH_LIFT },
			rotation: { x: 0, y: 0, z: 0 },
			scale: { x: cardScale, y: cardScale, z: cardScale },
			opacity: edgeOpacity(gridX, gridY, visibleWidth, visibleHeight)
		};
	});
}

export function fitViewport(
	rawParams: LayoutParams,
	camera: CameraState,
	aspect: number
): { params: LayoutParams; count: number } {
	const values = clampParams(params, rawParams);
	const gapX = Number(values.gapX);
	const gapY = Number(values.gapY);
	const distance = Math.hypot(
		camera.position.x - camera.target.x,
		camera.position.y - camera.target.y,
		camera.position.z - camera.target.z
	);
	const height = 2 * distance * Math.tan((camera.fov * Math.PI) / 360);
	const width = height * Math.max(0.01, aspect);
	const columns = oddCeil(width / gapX + GRID_BUFFER_CELLS);
	const rows = oddCeil(height / gapY + GRID_BUFFER_CELLS);
	const fitted = { ...rawParams, [RENDER_COLUMNS]: columns, [RENDER_ROWS]: rows };

	return { params: fitted, count: columns * rows };
}

export function instanceCount(mediaCount: number, rawParams: LayoutParams): number {
	if (mediaCount <= 0) {
		return 0;
	}

	const values = clampParams(params, rawParams);
	const columns = renderSize(rawParams, RENDER_COLUMNS, Math.round(Number(values.columns)));
	const rows = renderSize(rawParams, RENDER_ROWS, Math.round(Number(values.rows)));
	return Math.max(mediaCount, columns * rows);
}

export function renderColumns(rawParams: LayoutParams): number {
	const values = clampParams(params, rawParams);
	return renderSize(rawParams, RENDER_COLUMNS, Math.round(Number(values.columns)));
}

function makeRoute(stops: number, seed: number): { x: number; y: number }[] {
	const route = [{ x: 0, y: 0 }];
	const offset = modulo(Math.trunc(seed), DIRECTIONS.length);

	for (let index = 1; index < stops; index++) {
		const previous = route[index - 1];
		const direction = DIRECTIONS[(offset + (index - 1) * 3) % DIRECTIONS.length];
		route.push({ x: previous.x + direction.x, y: previous.y + direction.y });
	}

	return route;
}

function travelProgress(value: number, pause: number): number {
	if (value <= pause) {
		return 0;
	}

	return easeInOutExpo((value - pause) / (1 - pause));
}

function easeInOutExpo(value: number): number {
	if (value <= 0 || value >= 1) {
		return value;
	}

	const scale = 2 * (Math.pow(2, EASE_EXPONENT) - 1);
	if (value < 0.5) {
		return (Math.pow(2, EASE_EXPONENT * 2 * value) - 1) / scale;
	}

	return 1 - (Math.pow(2, EASE_EXPONENT * 2 * (1 - value)) - 1) / scale;
}

function interpolate(
	start: { x: number; y: number },
	end: { x: number; y: number },
	progress: number
): { x: number; y: number } {
	return {
		x: start.x + (end.x - start.x) * progress,
		y: start.y + (end.y - start.y) * progress
	};
}

function edgeOpacity(x: number, y: number, width: number, height: number): number {
	const distance = Math.max(Math.abs(x) / (width / 2), Math.abs(y) / (height / 2));
	const fade = Math.max(0, Math.min(1, (distance - EDGE_FADE_START) / (1 - EDGE_FADE_START)));
	return 1 - fade * fade * (3 - 2 * fade);
}

function wrap(value: number, size: number): number {
	return modulo(value + size / 2, size) - size / 2;
}

function renderSize(rawParams: LayoutParams, name: string, visible: number): number {
	const fallback = visible + GRID_BUFFER_CELLS;
	const value = Number(rawParams[name] ?? fallback);
	return Number.isFinite(value) ? Math.max(fallback, Math.round(value)) : fallback;
}

function oddCeil(value: number): number {
	const rounded = Math.ceil(value);
	return rounded % 2 === 0 ? rounded + 1 : rounded;
}

function modulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}
