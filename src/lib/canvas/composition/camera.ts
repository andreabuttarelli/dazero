import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Vec3 } from './types';

export type CameraState = {
	position: Vec3;
	target: Vec3;
	fov: number;
};

export type CameraPresetId = 'static' | 'slow-orbit' | 'push-in' | 'dolly';

export type Easing = 'linear' | 'ease-in-out';

export type Keyframe = {
	t: number;
	camera: CameraState;
	easing: Easing;
};

type CameraPresetDefinition = {
	label: string;
	params: LayoutParam[];
	cameraAt: (params: LayoutParams, t: number) => CameraState;
};

const DEFAULT_TARGET: Vec3 = { x: 0, y: 0, z: 0 };
const DEFAULT_FOV = 50;

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPresetDefinition> = {
	static: {
		label: 'Fisso',
		params: [
			{ name: 'distance', label: 'Distanza', kind: 'range', min: 1, max: 40, step: 0.5, default: 12 },
			{ name: 'fov', label: 'Campo visivo', kind: 'range', min: 20, max: 100, step: 1, default: DEFAULT_FOV }
		],
		cameraAt: (params) => ({
			position: { x: 0, y: 0, z: Number(params.distance) },
			target: DEFAULT_TARGET,
			fov: Number(params.fov)
		})
	},
	'slow-orbit': {
		label: 'Orbita lenta',
		params: [
			{ name: 'radius', label: 'Raggio', kind: 'range', min: 1, max: 40, step: 0.5, default: 12 },
			{ name: 'height', label: 'Altezza', kind: 'range', min: -20, max: 20, step: 0.5, default: 2 },
			{ name: 'speed', label: 'Velocità', kind: 'range', min: 0.01, max: 1, step: 0.01, default: 0.1 },
			{ name: 'fov', label: 'Campo visivo', kind: 'range', min: 20, max: 100, step: 1, default: DEFAULT_FOV }
		],
		cameraAt: (params, t) => {
			const angle = Number(params.speed) * t * Math.PI * 2;
			return {
				position: {
					x: Math.sin(angle) * Number(params.radius),
					y: Number(params.height),
					z: Math.cos(angle) * Number(params.radius)
				},
				target: DEFAULT_TARGET,
				fov: Number(params.fov)
			};
		}
	},
	'push-in': {
		label: 'Avvicinamento',
		params: [
			{ name: 'startDistance', label: 'Distanza iniziale', kind: 'range', min: 5, max: 60, step: 0.5, default: 25 },
			{ name: 'endDistance', label: 'Distanza finale', kind: 'range', min: 1, max: 30, step: 0.5, default: 6 },
			{ name: 'duration', label: 'Durata (s)', kind: 'range', min: 1, max: 60, step: 1, default: 10 },
			{ name: 'fov', label: 'Campo visivo', kind: 'range', min: 20, max: 100, step: 1, default: DEFAULT_FOV }
		],
		cameraAt: (params, t) => {
			const progress = Math.min(1, Math.max(0, Number(params.duration) === 0 ? 1 : t / Number(params.duration)));
			const distance = Number(params.startDistance) + (Number(params.endDistance) - Number(params.startDistance)) * progress;
			return { position: { x: 0, y: 0, z: distance }, target: DEFAULT_TARGET, fov: Number(params.fov) };
		}
	},
	dolly: {
		label: 'Carrello',
		params: [
			{ name: 'distance', label: 'Distanza', kind: 'range', min: 1, max: 40, step: 0.5, default: 12 },
			{ name: 'travel', label: 'Estensione', kind: 'range', min: 1, max: 40, step: 0.5, default: 10 },
			{ name: 'speed', label: 'Velocità', kind: 'range', min: 0.01, max: 1, step: 0.01, default: 0.1 },
			{ name: 'fov', label: 'Campo visivo', kind: 'range', min: 20, max: 100, step: 1, default: DEFAULT_FOV }
		],
		cameraAt: (params, t) => {
			const x = Math.sin(Number(params.speed) * t * Math.PI * 2) * Number(params.travel);
			return { position: { x, y: 0, z: Number(params.distance) }, target: DEFAULT_TARGET, fov: Number(params.fov) };
		}
	}
};

export function cameraAt(id: CameraPresetId, params: LayoutParams, t: number): CameraState {
	const preset = CAMERA_PRESETS[id];
	const clamped = clampParams(preset.params, params);
	return preset.cameraAt(clamped, t);
}

const EASINGS: Record<Easing, (x: number) => number> = {
	linear: (x) => x,
	'ease-in-out': (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
};

const DEFAULT_CAMERA: CameraState = { position: { x: 0, y: 0, z: 12 }, target: DEFAULT_TARGET, fov: DEFAULT_FOV };

export function interpolateKeyframes(keyframes: Keyframe[], t: number): CameraState {
	if (keyframes.length === 0) {
		return DEFAULT_CAMERA;
	}

	const sorted = [...keyframes].sort((a, b) => a.t - b.t);

	if (t <= sorted[0].t) {
		return sorted[0].camera;
	}

	if (t >= sorted[sorted.length - 1].t) {
		return sorted[sorted.length - 1].camera;
	}

	const nextIndex = sorted.findIndex((keyframe) => keyframe.t > t);
	const from = sorted[nextIndex - 1];
	const to = sorted[nextIndex];
	const span = to.t - from.t;
	const rawProgress = span === 0 ? 1 : (t - from.t) / span;
	const progress = EASINGS[to.easing](rawProgress);

	return {
		position: lerpVec3(from.camera.position, to.camera.position, progress),
		target: lerpVec3(from.camera.target, to.camera.target, progress),
		fov: from.camera.fov + (to.camera.fov - from.camera.fov) * progress
	};
}

function lerpVec3(a: Vec3, b: Vec3, progress: number): Vec3 {
	return {
		x: a.x + (b.x - a.x) * progress,
		y: a.y + (b.y - a.y) * progress,
		z: a.z + (b.z - a.z) * progress
	};
}
