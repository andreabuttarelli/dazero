import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    clear: () => store.clear()
  };
}

describe('il consenso ai cookie persiste sotto la chiave rinominata', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeLocalStorage();
    vi.resetModules();
  });

  it('setConsent scrive sotto la chiave feega_', async () => {
    const { setConsent } = await import('./consent');
    await setConsent('denied');

    expect(localStorage.getItem('feega_cookie_consent_v1')).toBe('denied');
  });

  it('legge ancora un consenso scritto sotto la chiave dazero_ prima della rinomina', async () => {
    localStorage.setItem('dazero_cookie_consent_v1', 'granted');
    const { consent } = await import('./consent');

    let current: string | null = null;
    consent.subscribe((v) => (current = v))();

    expect(current).toBe('granted');
  });
});
