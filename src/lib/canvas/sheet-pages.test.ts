import { describe, expect, it } from 'vitest';
import { SHEET_PAGE_LOADERS, settingsPageLoader, settingsSectionOf } from './sheet-pages';

describe('settingsSectionOf: quale cartella sotto settings/ risponde a questo path', () => {
  it('la radice di settings apre connected-accounts, come fa il suo redirect', () => {
    expect(settingsSectionOf('/settings')).toBe('connected-accounts');
    expect(settingsSectionOf('/settings/')).toBe('connected-accounts');
  });

  it('ogni sezione usa il suo primo segmento', () => {
    expect(settingsSectionOf('/settings/brand')).toBe('brand');
    expect(settingsSectionOf('/settings/connected-accounts')).toBe('connected-accounts');
    expect(settingsSectionOf('/settings/api-keys')).toBe('api-keys');
  });

  it('una sottopagina di una sezione resta nella sezione', () => {
    expect(settingsSectionOf('/settings/brand/logo')).toBe('brand');
  });
});

describe('settingsPageLoader: la sezione trova la sua pagina reale', () => {
  it('ogni sezione esistente sotto settings/ ha un loader', () => {
    for (const section of ['brand', 'connected-accounts', 'api-keys', 'team', 'profile', 'appearance', 'billing', 'danger', 'products', 'ads']) {
      expect(settingsPageLoader(`/settings/${section}`), `manca la pagina per ${section}`).not.toBeNull();
    }
  });

  it('una sezione inesistente non trova niente', () => {
    expect(settingsPageLoader('/settings/does-not-exist')).toBeNull();
  });

  it('una sezione a due livelli (ads/accounts) trova la sua pagina, non quella del genitore', () => {
    expect(settingsPageLoader('/settings/ads/accounts')).not.toBeNull();
    expect(settingsPageLoader('/settings/ads/accounts')).not.toBe(settingsPageLoader('/settings/ads'));
  });

  it('la radice di settings trova la stessa pagina di connected-accounts', () => {
    expect(settingsPageLoader('/settings')).toBe(settingsPageLoader('/settings/connected-accounts'));
  });
});

describe('SHEET_PAGE_LOADERS: il foglio scarica le sue pagine solo quando si apre', () => {
  it('calendar, ads e il guscio di settings sono moduli pigri, non import statici della tela', async () => {
    for (const load of [SHEET_PAGE_LOADERS.calendar, SHEET_PAGE_LOADERS.ads, SHEET_PAGE_LOADERS.settingsLayout]) {
      expect(typeof load).toBe('function');
      expect((await load()).default).toBeTruthy();
    }
  });
});
