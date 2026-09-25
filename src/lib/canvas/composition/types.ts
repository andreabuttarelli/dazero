export type Vec3 = { x: number; y: number; z: number };

export type Transform = {
	position: Vec3;
	rotation: Vec3;
	scale: Vec3;
	opacity?: number;
};

export type LayoutId =
	| 'tilted-grid'
	| 'carousel-3d'
	| 'media-cloud'
	| 'media-ring'
	| 'helix'
	| 'vertical-flow'
	| 'coverflow';

export type LayoutParam =
	| { name: string; label: string; kind: 'range'; min: number; max: number; step: number; default: number }
	| { name: string; label: string; kind: 'select'; options: { value: string; label: string }[]; default: string }
	| { name: string; label: string; kind: 'color'; default: string }
	| { name: string; label: string; kind: 'seed'; default: number };

export type LayoutParams = Record<string, number | string>;
