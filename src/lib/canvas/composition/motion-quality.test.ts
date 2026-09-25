import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA_PRESETS, cameraAt } from './camera';
import { LAYOUTS, instanceCountFor, layoutAt } from './index';
import { closedExpoPhase, closedExpoProgress } from './motion';
import type { LayoutId, LayoutParams, Transform } from './types';

const DURATION_SECONDS = 8;
const FRAMES_PER_SECOND = 60;
const MEDIA_COUNT = 3;
const MAX_WORLD_STEP = 1;
const PORTRAIT_ASPECT = 9 / 16;

describe('composition motion quality', () => {
	for (const id of Object.keys(LAYOUTS) as LayoutId[]) {
		it(`${id} has a social-safe default density`, () => {
			const params = defaultsFor(id);
			expect(instanceCountFor(id, MEDIA_COUNT, params)).toBeLessThanOrEqual(9);
		});

		it(`${id} has no abrupt jumps at its defaults`, () => {
			const params = defaultsFor(id);
			const count = instanceCountFor(id, MEDIA_COUNT, params);
			const frames = sample(id, count, params);
			const steps = frameSteps(frames);
			const largestStep = Math.max(...steps);

			expect(largestStep).toBeLessThanOrEqual(MAX_WORLD_STEP);
		});

		it(`${id} keeps media in the portrait frame at its defaults`, () => {
			const params = defaultsFor(id);
			const count = instanceCountFor(id, MEDIA_COUNT, params);
			const cameraParams = Object.fromEntries(
				CAMERA_PRESETS['slow-orbit'].params.map((param) => [param.name, param.default])
			);
			const frames = sample(id, count, params);

			for (let frame = 0; frame < frames.length; frame++) {
				const progress = closedExpoProgress(frame / FRAMES_PER_SECOND, DURATION_SECONDS);
				const cameraTime = LAYOUTS[id].camera === 'fixed' ? 0 : progress;
				const state = cameraAt('slow-orbit', cameraParams, cameraTime);
				const camera = makeCamera(state);
				const visible = frames[frame].filter((transform) => inFrame(transform, camera));

				expect(visible.length).toBeGreaterThan(0);
			}
		});
	}
});

function defaultsFor(id: LayoutId): LayoutParams {
	return Object.fromEntries(LAYOUTS[id].params.map((param) => [param.name, param.default]));
}

function sample(id: LayoutId, count: number, params: LayoutParams): Transform[][] {
	const frameCount = DURATION_SECONDS * FRAMES_PER_SECOND;

	return Array.from({ length: frameCount + 1 }, (_, frame) => {
		const seconds = frame / FRAMES_PER_SECOND;
		const motion = LAYOUTS[id].motion === 'cycle'
			? closedExpoPhase(seconds, DURATION_SECONDS)
			: closedExpoProgress(seconds, DURATION_SECONDS);
		return layoutAt(id, count, params, motion);
	});
}

function frameSteps(frames: Transform[][]): number[] {
	return frames.slice(1).flatMap((frame, frameIndex) =>
		frame.map((transform, itemIndex) => distance(transform, frames[frameIndex][itemIndex]))
	);
}

function distance(a: Transform, b: Transform): number {
	if ((a.opacity ?? 1) < 0.1 && (b.opacity ?? 1) < 0.1) {
		return 0;
	}

	return Math.hypot(
		a.position.x - b.position.x,
		a.position.y - b.position.y,
		a.position.z - b.position.z
	);
}

function makeCamera(state: ReturnType<typeof cameraAt>): THREE.PerspectiveCamera {
	const camera = new THREE.PerspectiveCamera(state.fov, PORTRAIT_ASPECT, 0.1, 500);
	camera.position.set(state.position.x, state.position.y, state.position.z);
	camera.lookAt(state.target.x, state.target.y, state.target.z);
	camera.updateMatrixWorld();
	camera.updateProjectionMatrix();
	return camera;
}

function inFrame(transform: Transform, camera: THREE.PerspectiveCamera): boolean {
	const point = new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z).project(camera);
	return point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
}
