import { describe, expect, it } from 'vitest';
import { fitViewport, params, transforms } from './explorer-grid';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('explorer-grid transforms', () => {
	it('visits different media while returning to its starting frame', () => {
		const start = transforms(25, DEFAULTS, 0);
		const nextStop = transforms(25, DEFAULTS, 0.25);
		const end = transforms(25, DEFAULTS, 1);

		expect(centeredIndex(start)).not.toBe(centeredIndex(nextStop));
		expect(end).toEqual(start);
	});

	it('passes over intermediate media with a fixed frontal camera', () => {
		const travelling = transforms(25, { ...DEFAULTS, pause: 0 }, 0.125);
		const centered = travelling.filter((item) => Math.hypot(item.position.x, item.position.y) < 0.05);

		expect(centered).toHaveLength(0);
		for (const item of travelling) {
			expect(item.rotation).toEqual({ x: 0, y: 0, z: 0 });
		}
	});

	it('renders an outer buffer that keeps the grid continuous', () => {
		const items = transforms(25, DEFAULTS, 0.6);

		expect(items).toHaveLength(25);
		expect(new Set(items.map((item) => item.position.x.toFixed(2))).size).toBe(5);
		expect(new Set(items.map((item) => item.position.y.toFixed(2))).size).toBe(5);
	});

	it('zooms the whole grid out while travelling and back in on every focus', () => {
		const focused = transforms(25, { ...DEFAULTS, pause: 0 }, 0);
		const travelling = transforms(25, { ...DEFAULTS, pause: 0 }, 0.125);
		const nextFocus = transforms(25, { ...DEFAULTS, pause: 0 }, 0.25);

		expect(gridSpan(focused)).toBeGreaterThan(gridSpan(travelling));
		expect(gridSpan(nextFocus)).toBeCloseTo(gridSpan(focused), 10);
		expect(Math.max(...focused.map((item) => item.scale.x))).toBeGreaterThan(
			Math.max(...travelling.map((item) => item.scale.x))
		);
	});

	it('keeps the visible grid compact', () => {
		const items = transforms(25, DEFAULTS, 0.6);

		for (const item of items) {
			expect(Math.abs(item.position.x)).toBeLessThanOrEqual(6);
			expect(Math.abs(item.position.y)).toBeLessThanOrEqual(7);
		}
	});

	it('fills the full camera frustum after zooming out', () => {
		const camera = {
			position: { x: 0, y: 0, z: 40 },
			target: { x: 0, y: 0, z: 0 },
			fov: 100
		};
		const aspect = 9 / 16;
		const fitted = fitViewport(DEFAULTS, camera, aspect);
		const items = transforms(fitted.count, fitted.params, 0);
		const visible = items.filter((item) => (item.opacity ?? 1) > 0);
		const height = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);

		expect(gridSpan(visible)).toBeGreaterThanOrEqual(height * aspect);
		expect(gridHeight(visible)).toBeGreaterThanOrEqual(height);
	});
});

function gridSpan(items: ReturnType<typeof transforms>): number {
	const xs = items.map((item) => item.position.x);
	return Math.max(...xs) - Math.min(...xs);
}

function gridHeight(items: ReturnType<typeof transforms>): number {
	const ys = items.map((item) => item.position.y);
	return Math.max(...ys) - Math.min(...ys);
}

function centeredIndex(items: ReturnType<typeof transforms>): number {
	return items.reduce((nearest, item, index) => {
		const distance = Math.hypot(item.position.x, item.position.y);
		const nearestDistance = Math.hypot(items[nearest].position.x, items[nearest].position.y);
		return distance < nearestDistance ? index : nearest;
	}, 0);
}
