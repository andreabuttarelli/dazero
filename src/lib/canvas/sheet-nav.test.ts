import { describe, expect, it } from 'vitest';
import { sheetOutcomeOf } from './sheet-nav';

describe('sheetOutcomeOf: cosa fare del load della rotta vera', () => {
  it('un redirect naviga per davvero verso la sua destinazione, non apre un foglio vuoto', () => {
    const outcome = sheetOutcomeOf('/p/x/settings', {
      type: 'redirect',
      location: '/p/x/settings/connected-accounts'
    });
    expect(outcome).toEqual({ kind: 'navigate', href: '/p/x/settings/connected-accounts' });
  });

  it('un load riuscito apre il foglio con i suoi dati', () => {
    const outcome = sheetOutcomeOf('/p/x/calendar', {
      type: 'loaded',
      status: 200,
      data: { posts: [] }
    });
    expect(outcome).toEqual({ kind: 'open', href: '/p/x/calendar', data: { posts: [] } });
  });

  it('un load con status diverso da 200 naviga invece di aprire un foglio a metà', () => {
    const outcome = sheetOutcomeOf('/p/x/ads/social', {
      type: 'loaded',
      status: 500,
      data: {}
    });
    expect(outcome).toEqual({ kind: 'navigate', href: '/p/x/ads/social' });
  });
});
