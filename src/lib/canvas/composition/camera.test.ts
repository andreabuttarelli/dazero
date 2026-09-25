import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS, cameraAt, interpolateKeyframes } from './camera';

describe('cameraAt presets', () => {
	it('static stays put across time', () => {
		const params = Object.fromEntries(CAMERA_PRESETS.static.params.map((p) => [p.name, p.default]));
		const at0 = cameraAt('static', params, 0);
		const at5 = cameraAt('static', params, 5);

		expect(at0).toEqual(at5);
	});

	it('slow orbit moves position but keeps target fixed', () => {
		const params = Object.fromEntries(CAMERA_PRESETS['slow-orbit'].params.map((p) => [p.name, p.default]));
		const at0 = cameraAt('slow-orbit', params, 0);
		const at1 = cameraAt('slow-orbit', params, 1);

		expect(at0.position.x).not.toBeCloseTo(at1.position.x);
		expect(at0.target).toEqual(at1.target);
	});

	it('push-in decreases distance to target over time', () => {
		const params = Object.fromEntries(CAMERA_PRESETS['push-in'].params.map((p) => [p.name, p.default]));
		const at0 = cameraAt('push-in', params, 0);
		const at1 = cameraAt('push-in', params, 1);

		const dist0 = Math.hypot(at0.position.x, at0.position.y, at0.position.z);
		const dist1 = Math.hypot(at1.position.x, at1.position.y, at1.position.z);
		expect(dist1).toBeLessThan(dist0);
	});

	it('dolly slides position along x over time', () => {
		const params = Object.fromEntries(CAMERA_PRESETS.dolly.params.map((p) => [p.name, p.default]));
		const at0 = cameraAt('dolly', params, 0);
		const at1 = cameraAt('dolly', params, 1);

		expect(at0.position.x).not.toBeCloseTo(at1.position.x);
	});

	it('is deterministic for the same inputs', () => {
		const params = Object.fromEntries(CAMERA_PRESETS['slow-orbit'].params.map((p) => [p.name, p.default]));
		expect(cameraAt('slow-orbit', params, 2.5)).toEqual(cameraAt('slow-orbit', params, 2.5));
	});
});

describe('interpolateKeyframes', () => {
	const keyframes = [
		{ t: 0, camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50 }, easing: 'linear' as const },
		{ t: 2, camera: { position: { x: 10, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50 }, easing: 'linear' as const }
	];

	it('returns the first keyframe before the range', () => {
		expect(interpolateKeyframes(keyframes, -1).position.x).toBe(0);
	});

	it('returns the last keyframe after the range', () => {
		expect(interpolateKeyframes(keyframes, 10).position.x).toBe(10);
	});

	it('linearly interpolates at the midpoint', () => {
		expect(interpolateKeyframes(keyframes, 1).position.x).toBeCloseTo(5);
	});

	it('empty keyframes returns a default camera', () => {
		const result = interpolateKeyframes([], 1);
		expect(result.fov).toBeGreaterThan(0);
	});
});
