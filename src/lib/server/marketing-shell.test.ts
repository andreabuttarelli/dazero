import { afterEach, describe, expect, it, vi } from 'vitest';

const fake: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env: fake }));

const { hideMarketing } = await import('./marketing-shell');

afterEach(() => {
	delete fake.HIDE_MARKETING;
});

describe('hideMarketing', () => {
	it('spento di default: il hosted product non cambia', () => {
		expect(hideMarketing()).toBe(false);
	});

	it('stringa vuota o spazi valgono come non impostata', () => {
		fake.HIDE_MARKETING = '   ';
		expect(hideMarketing()).toBe(false);
	});

	it('1 / true / yes, qualunque casing', () => {
		for (const v of ['1', 'true', 'TRUE', 'yes', 'Yes']) {
			fake.HIDE_MARKETING = v;
			expect(hideMarketing(), v).toBe(true);
		}
	});

	it('0 / false / garbage non accendono niente', () => {
		for (const v of ['0', 'false', 'no', 'on', 'hide']) {
			fake.HIDE_MARKETING = v;
			expect(hideMarketing(), v).toBe(false);
		}
	});
});
