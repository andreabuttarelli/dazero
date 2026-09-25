import * as carousel3d from './carousel-3d';
import * as tiltedGrid from './tilted-grid';
import type { LayoutId, LayoutParam, LayoutParams, Transform } from './types';

type LayoutDefinition = {
	label: string;
	params: LayoutParam[];
	transforms: (count: number, params: LayoutParams, t: number) => Transform[];
};

export const LAYOUTS: Record<LayoutId, LayoutDefinition> = {
	'tilted-grid': { label: 'Griglia obliqua', params: tiltedGrid.params, transforms: tiltedGrid.transforms },
	'carousel-3d': { label: 'Carosello 3D', params: carousel3d.params, transforms: carousel3d.transforms }
};

export function layoutAt(id: LayoutId, count: number, params: LayoutParams, t: number): Transform[] {
	return LAYOUTS[id].transforms(count, params, t);
}

export type { LayoutId, LayoutParam, LayoutParams, Transform, Vec3 } from './types';
