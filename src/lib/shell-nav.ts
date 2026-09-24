export type NavFamily = 'panel' | 'sheet';

export type NavEntry = {
  id: string;
  labelKey: string;
  icon: 'images' | 'building' | 'user-round' | 'calendar-days' | 'megaphone' | 'settings';
  family: NavFamily;
  path: string;
  group: 'panel' | 'workbench' | 'hidden';
};

/**
 * OGNI VOCE DELLA RAIL, IN UNA TABELLA SOLA. `family` decide come si apre — `panel` accanto alla
 * tela (Assets/Brands, un pannello alla volta), `sheet` al posto della tela (Calendar/Ads/
 * Settings, un foglio SvelteKit shallow-routed sopra). La rail li separa in due gruppi con un
 * divisore: il raggruppamento stesso dice il comportamento, senza un `if` per voce altrove.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { id: 'assets', labelKey: 'app.nav2.materials', icon: 'images', family: 'panel', path: '/assets', group: 'panel' },
  { id: 'brands', labelKey: 'app.nav2.brands', icon: 'building', family: 'panel', path: '/brands', group: 'panel' },
  { id: 'influencers', labelKey: 'app.nav2.influencers', icon: 'user-round', family: 'panel', path: '/influencers', group: 'panel' },
  { id: 'calendar', labelKey: 'app.hub.publish.calendar', icon: 'calendar-days', family: 'sheet', path: '/calendar', group: 'workbench' },
  { id: 'ads', labelKey: 'app.hub.ads.social', icon: 'megaphone', family: 'sheet', path: '/ads/social', group: 'workbench' },
  { id: 'settings', labelKey: 'app.nav.settings', icon: 'settings', family: 'sheet', path: '/settings/connected-accounts', group: 'workbench' },
  { id: 'create-post', labelKey: 'app.hub.publish.createPost', icon: 'megaphone', family: 'sheet', path: '/create-post', group: 'hidden' }
];

export function navEntriesByGroup(group: NavEntry['group']): NavEntry[] {
  return NAV_ENTRIES.filter((entry) => entry.group === group);
}

export function navHref(projectId: string, entry: NavEntry): string {
  return `/p/${projectId}${entry.path}`;
}

/**
 * LA RADICE DI UNA VOCE `sheet` è il suo primo segmento (`/settings`, `/calendar`, `/ads`): il
 * foglio Settings deve restare aperto anche su `/settings/brand`, non solo sull'esatto
 * `/settings/connected-accounts` a cui la rail porta di default — la sezione dentro cambia, la
 * famiglia no. Una sola regola invece di un elenco di prefissi sparso fra layout e componenti.
 */
function sheetRootOf(entry: NavEntry): string {
  return `/${entry.path.split('/')[1]}`;
}

export function sheetEntryForPath(path: string): NavEntry | null {
  const normalized = path.split(/[?#]/)[0].replace(/\/$/, '');
  return (
    NAV_ENTRIES.find((entry) => {
      if (entry.family !== 'sheet') return false;
      const root = sheetRootOf(entry);
      return normalized === root || normalized.startsWith(`${root}/`);
    }) ?? null
  );
}

export type MobileTab = { id: string; labelKey: string; icon: 'layout-grid' | 'message-circle' | 'calendar-days' | 'more-horizontal'; path: string | null };

/**
 * LA BARRA MOBILE: quattro voci fisse, non l'inventario della rail. "More" non ha un `path` —
 * apre un foglio locale con le voci restanti (Assets, Brands, Ads, Settings), che su schermo
 * piccolo sono rotte intere e non pannelli/sheet.
 */
export const MOBILE_TABS: MobileTab[] = [
  { id: 'canvas', labelKey: 'app.shell.mobile.canvas', icon: 'layout-grid', path: null },
  { id: 'chat', labelKey: 'app.shell.mobile.chat', icon: 'message-circle', path: null },
  { id: 'calendar', labelKey: 'app.hub.publish.calendar', icon: 'calendar-days', path: '/calendar' },
  { id: 'more', labelKey: 'app.shell.mobile.more', icon: 'more-horizontal', path: null }
];

export const MOBILE_MORE_ENTRIES: NavEntry[] = NAV_ENTRIES.filter(
  (entry) => entry.group !== 'hidden' && entry.id !== 'calendar'
);
