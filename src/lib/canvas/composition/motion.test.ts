import { describe, expect, it } from 'vitest';
import { closedExpoPhase, closedExpoProgress } from './motion';

describe('closedExpoProgress', () => {
	it('returns to the exact first frame at the loop boundary', () => {
		expect(closedExpoProgress(0, 8)).toBe(0);
		expect(closedExpoProgress(8, 8)).toBe(0);
		expect(closedExpoProgress(16, 8)).toBe(0);
	});

	it('mirrors the outbound and inbound halves', () => {
		expect(closedExpoProgress(2, 8)).toBeCloseTo(closedExpoProgress(6, 8));
		expect(closedExpoProgress(4, 8)).toBeCloseTo(1);
	});

	it('moves less near the seam than around the middle of a leg', () => {
		const nearSeam = closedExpoProgress(0.1, 8) - closedExpoProgress(0, 8);
		const midLeg = closedExpoProgress(2.1, 8) - closedExpoProgress(2, 8);

		expect(nearSeam).toBeLessThan(midLeg);
	});
});

describe('closedExpoPhase', () => {
	it('advances once and closes at the duration boundary', () => {
		expect(closedExpoPhase(0, 8)).toBe(0);
		expect(closedExpoPhase(4, 8)).toBeCloseTo(0.5);
		expect(closedExpoPhase(7.99, 8)).toBeGreaterThan(0.99);
		expect(closedExpoPhase(8, 8)).toBe(0);
	});
});
