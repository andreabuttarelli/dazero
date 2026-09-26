import type { Component } from 'svelte';

type PageModule = { default: Component<{ data: unknown; form: unknown }> };

/**
 * OGNI `+page.svelte` SOTTO `settings/`, CARICATA PIGRA E PER CARTELLA — non un elenco scritto a
 * mano che Agent F dovrebbe ricordarsi di aggiornare a ogni sezione nuova. `**` cattura anche le
 * sezioni a due livelli (`settings/ads/accounts`); la radice (`settings/+page.svelte`, che oggi è
 * solo un redirect) non ha materiale da mostrare in un foglio, quindi resta fuori dal glob.
 */
const SETTINGS_PAGE_MODULES = import.meta.glob<PageModule>(
  '/src/routes/p/[projectId]/settings/**/+page.svelte'
);

export const SHEET_PAGE_LOADERS = {
  calendar: () => import('../../routes/p/[projectId]/calendar/+page.svelte') as Promise<PageModule>,
  ads: () => import('../../routes/p/[projectId]/ads/social/+page.svelte') as Promise<PageModule>,
  createPost: () => import('../../routes/p/[projectId]/create-post/+page.svelte') as Promise<PageModule>,
  settingsLayout: () => import('../../routes/p/[projectId]/settings/+layout.svelte') as Promise<PageModule>
};

/** Il primo segmento sotto `settings/` — la sezione del GRUPPO, per evidenziare la voce attiva
 *  nello switcher. `ads/accounts` e `ads` sono due pagine diverse nello stesso gruppo "ads". */
export function settingsSectionOf(path: string): string {
  const section = path.replace(/^\/settings\/?/, '').split('/')[0];
  return section || 'connected-accounts';
}

/** Il percorso intero sotto `settings/` — quello che sceglie DAVVERO quale `+page.svelte` caricare. */
function settingsSubpathOf(path: string): string {
  const subpath = path.replace(/^\/settings\/?/, '');
  return subpath || 'connected-accounts';
}

export function settingsPageLoader(path: string): (() => Promise<PageModule>) | null {
  const key = `/src/routes/p/[projectId]/settings/${settingsSubpathOf(path)}/+page.svelte`;
  return SETTINGS_PAGE_MODULES[key] ?? null;
}
