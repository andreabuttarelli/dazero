import { describe, expect, it } from 'vitest';
import { freeOrgCount, isOrgFree, WELCOME_ALREADY_GRANTED_CODE } from './free-org-limit';
import { fakeDb } from '$lib/server/db/fake-db';

const USER = '22222222-2222-2222-2222-222222222222';
const ORG_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const ORG_B = 'bbbbbbbb-1111-1111-1111-111111111111';
const ORG_C = 'cccccccc-1111-1111-1111-111111111111';

describe('isOrgFree', () => {
	it('è vera senza righe credit_ledger di acquisto vero', async () => {
		const { db } = fakeDb({ credit_ledger: [] });
		expect(await isOrgFree(db, ORG_A)).toBe(true);
	});

	it('un grant di benvenuto (promo) non toglie la gratuità', async () => {
		const { db } = fakeDb({ credit_ledger: [{ org_id: ORG_A, source: 'promo' }] });
		expect(await isOrgFree(db, ORG_A)).toBe(true);
	});

	it('un acquisto una tantum toglie la gratuità', async () => {
		const { db } = fakeDb({ credit_ledger: [{ org_id: ORG_A, source: 'one_time_purchase' }] });
		expect(await isOrgFree(db, ORG_A)).toBe(false);
	});

	it('un abbonamento toglie la gratuità', async () => {
		const { db } = fakeDb({ credit_ledger: [{ org_id: ORG_A, source: 'subscription_renewal' }] });
		expect(await isOrgFree(db, ORG_A)).toBe(false);
	});
});

describe('freeOrgCount', () => {
	it('conta ogni org di cui l\'utente è membro, non solo quelle possedute', async () => {
		const { db } = fakeDb({
			orgs_members: [
				{ org_id: ORG_A, user_id: USER, role: 'owner' },
				{ org_id: ORG_B, user_id: USER, role: 'member' }
			],
			credit_ledger: []
		});

		expect(await freeOrgCount(db, USER)).toBe(2);
	});

	it('un\'org che ha già pagato non conta', async () => {
		const { db } = fakeDb({
			orgs_members: [
				{ org_id: ORG_A, user_id: USER, role: 'owner' },
				{ org_id: ORG_B, user_id: USER, role: 'member' }
			],
			credit_ledger: [{ org_id: ORG_B, source: 'one_time_purchase' }]
		});

		expect(await freeOrgCount(db, USER)).toBe(1);
	});

	it('tre org gratuite contano tre, il limite lo applica il chiamante', async () => {
		const { db } = fakeDb({
			orgs_members: [
				{ org_id: ORG_A, user_id: USER, role: 'owner' },
				{ org_id: ORG_B, user_id: USER, role: 'owner' },
				{ org_id: ORG_C, user_id: USER, role: 'member' }
			],
			credit_ledger: []
		});

		expect(await freeOrgCount(db, USER)).toBe(3);
	});
});

describe('WELCOME_ALREADY_GRANTED_CODE', () => {
	it('è la stringa che l\'unique su credit_ledger.stripe_event_id produce (23505)', () => {
		expect(WELCOME_ALREADY_GRANTED_CODE).toBe('23505');
	});
});
