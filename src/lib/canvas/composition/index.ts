import * as carousel3d from './carousel-3d';
import * as coverflow from './coverflow';
import * as helix from './helix';
import * as mediaCloud from './media-cloud';
import * as mediaRing from './media-ring';
import * as tiltedGrid from './tilted-grid';
import * as verticalFlow from './vertical-flow';
import type { LayoutId, LayoutParam, LayoutParams, Transform } from './types';

type LayoutDefinition = {
	label: string;
	motion: 'cycle' | 'ping-pong';
	camera: 'fixed' | 'selected';
	params: LayoutParam[];
	instances: (mediaCount: number, params: LayoutParams) => number;
	transforms: (count: number, params: LayoutParams, t: number) => Transform[];
};

export const LAYOUTS: Record<LayoutId, LayoutDefinition> = {
	'tilted-grid': {
		label: 'Griglia cinetica',
		motion: 'ping-pong',
		camera: 'selected',
		params: tiltedGrid.params,
		instances: (mediaCount, values) => filledCount(mediaCount, valueOf(values, 'columns', 3) * valueOf(values, 'rows', 3)),
		transforms: tiltedGrid.transforms
	},
	'carousel-3d': {
		label: 'Carosello orbitale',
		motion: 'cycle',
		camera: 'fixed',
		params: carousel3d.params,
		instances: (mediaCount, values) => filledCount(mediaCount, valueOf(values, 'slots', 7)),
		transforms: carousel3d.transforms
	},
	'media-cloud': {
		label: 'Nube cinematica',
		motion: 'ping-pong',
		camera: 'selected',
		params: mediaCloud.params,
		instances: (mediaCount, values) => filledCount(mediaCount, valueOf(values, 'density', 10)),
		transforms: mediaCloud.transforms
	},
	'media-ring': {
		label: 'Anelli sincronizzati',
		motion: 'ping-pong',
		camera: 'selected',
		params: mediaRing.params,
		instances: (mediaCount, values) =>
			filledCount(mediaCount, valueOf(values, 'rings', 1) * valueOf(values, 'itemsPerRing', 12)),
		transforms: mediaRing.transforms
	},
	helix: {
		label: 'Flusso elicoidale',
		motion: 'ping-pong',
		camera: 'selected',
		params: helix.params,
		instances: (mediaCount, values) => filledCount(mediaCount, valueOf(values, 'items', 10)),
		transforms: helix.transforms
	},
	'vertical-flow': {
		label: 'Flusso verticale',
		motion: 'cycle',
		camera: 'fixed',
		params: verticalFlow.params,
		instances: (mediaCount, values) => filledCount(mediaCount, valueOf(values, 'items', 7)),
		transforms: verticalFlow.transforms
	},
	coverflow: {
		label: 'Coverflow editoriale',
		motion: 'cycle',
		camera: 'fixed',
		params: coverflow.params,
		instances: (mediaCount, values) => filledCount(mediaCount, valueOf(values, 'items', 5)),
		transforms: coverflow.transforms
	}
};

export function layoutAt(id: LayoutId, count: number, params: LayoutParams, t: number): Transform[] {
	return LAYOUTS[id].transforms(count, params, t);
}

export function instanceCountFor(id: LayoutId, mediaCount: number, params: LayoutParams): number {
	return LAYOUTS[id].instances(mediaCount, params);
}

function valueOf(params: LayoutParams, name: string, fallback: number): number {
	const value = Number(params[name] ?? fallback);
	return Number.isFinite(value) ? Math.max(1, Math.round(value)) : fallback;
}

function filledCount(mediaCount: number, desired: number): number {
	return mediaCount > 0 ? Math.max(mediaCount, desired) : 0;
}

export type { LayoutId, LayoutParam, LayoutParams, Transform, Vec3 } from './types';
