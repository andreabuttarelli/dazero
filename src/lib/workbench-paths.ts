import { ADS_SELF_SERVE } from '$lib/ads-fee';

/** Resolve a short label for a brand-app pathname (English path segments). */
export function workbenchTabLabel(
  pathname: string,
  brandBase: string,
  t: (key: string) => string
): string {
  const base = brandBase.endsWith('/') ? brandBase.slice(0, -1) : brandBase;
  let rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  if (!rest || rest === '/') return t('app.shell.tabHome');
  rest = rest.replace(/^\//, '').split('?')[0];
  const seg = rest.split('/')[0] ?? '';

  const map: Record<string, string> = {
    calendar: 'app.hub.publish.calendar',
    'manual-posting': 'app.hub.publish.manualPosting',
    ads: 'app.hub.ads.label',
    studio: 'app.hub.brand.identity',
    settings: 'app.nav.settings',
    media: 'app.hub.designer.mediaLibrary',
    workbench: 'app.home.workbench.title'
  };

  // Ads hub pages would otherwise share one "Ads" tab label.
  if (seg === 'ads' && rest.includes('/google')) return t('app.hub.ads.google');
  if (seg === 'ads' && rest.includes('/social')) return t('app.hub.ads.social');
  if (seg === 'ads' && rest.includes('/library')) return t('app.hub.ads.library');

  const key = map[seg];
  if (key) return t(key);
  return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : t('app.shell.tabHome');
}

export type WorkbenchPageHub = 'publish' | 'brand' | 'designer' | 'ads';

export type WorkbenchPageDef = {
  hub: WorkbenchPageHub;
  /** Path segment under /p/{projectId}/ */
  segment: string;
  labelKey: string;
  /** Requires the ads entitlement (Starter and up) — free/Go land on Settings › Ads instead. */
  adsOnly?: boolean;
};

/** All openable workbench pages, grouped by hub (same as the sidebar macros). */
export const WORKBENCH_PAGES: WorkbenchPageDef[] = [
  { hub: 'brand', segment: 'studio', labelKey: 'app.hub.brand.identity' },
  { hub: 'publish', segment: 'calendar', labelKey: 'app.hub.publish.calendar' },
  { hub: 'publish', segment: 'manual-posting', labelKey: 'app.hub.publish.manualPosting' },
  // Paid lives in its own hub: channels + Meta Ad Library research.
  { hub: 'ads', segment: 'ads/social', labelKey: 'app.hub.ads.social', adsOnly: true },
  { hub: 'ads', segment: 'ads/library', labelKey: 'app.hub.ads.library', adsOnly: true },
  { hub: 'designer', segment: 'media', labelKey: 'app.hub.designer.mediaLibrary' }
];

export const WORKBENCH_HUBS: WorkbenchPageHub[] = ['brand', 'publish', 'ads', 'designer'];

/**
 * Sotto-pagine di ogni hub (sidebar). Le chiavi combaciano con `app.hub.{hub}.{key}`.
 */
export const HUB_TABS: Partial<Record<WorkbenchPageHub, { key: string; path: string; adsOnly?: boolean }[]>> = {
  brand: [{ key: 'identity', path: '/studio' }],
  publish: [
    { key: 'calendar', path: '/calendar' },
    { key: 'manualPosting', path: '/manual-posting' }
  ],
  // No 'overview' entry: the section is its channels + Meta Ad Library; /ads redirects to social.
  ads: [
    { key: 'social', path: '/ads/social', adsOnly: true },
    { key: 'library', path: '/ads/library', adsOnly: true }
  ],
  designer: [{ key: 'mediaLibrary', path: '/media' }]
};

export function workbenchPageHref(
  brandSlug: string,
  segment: string,
  _webHubEnabled = true,
  adsEnabled = false
): string {
  // Con ADS_SELF_SERVE spento le pagine ads mostrano un placeholder "prenota una call" per ogni
  // piano: non rimbalzare gli utenti non paganti. Si atterra sulle impostazioni ads, che spiegano
  // il requisito Pro e portano un bottone di upgrade ESPLICITO. Mai un checkout da qui: apre una
  // sessione Stripe su GET, e un click in sidebar è navigazione, non consenso a pagare.
  if ((segment === 'ads' || segment.startsWith('ads/')) && !adsEnabled && ADS_SELF_SERVE) {
    return `/app/${brandSlug}/settings/ads`;
  }
  return `/app/${brandSlug}/${segment}`;
}

// La nav del brand: la STRUTTURA pura (path + chiavi i18n), così workbench-paths.test.ts cammina
// l'albero e garantisce che OGNI destinazione dell'inventario (HUB_TABS qui sopra) resti
// raggiungibile — cambia la gerarchia, non l'inventario.

/** Token icona: il componente resta nel layout, l'inventario resta puro. */
export type NavIconId =
  | 'home'
  | 'images'
  | 'calendar'
  | 'palette'
  | 'send'
  | 'megaphone'
  | 'library';

export type NavTeamItem = {
  /** Path sotto /p/{projectId} (con lo slash iniziale, come HUB_TABS). Vuoto = la home del progetto. */
  path: string;
  labelKey: string;
  icon: NavIconId;
  /** Altri path che tengono attiva la voce (rotte sorelle/legacy che atterrano qui). */
  also?: string[];
  /** Badge dinamico del layout (stessi contatori della nav legacy). */
  badge?: 'content';
  adsOnly?: boolean;
};

/** Le due regioni della nav progetto e il suo vuoto. Italiano, come le etichette di sezione. */
export const NAV_SECTION = {
  boards: 'Tele',
  pages: 'Pagine',
  boardsEmpty: 'Nessuna tela'
} as const;

/**
 * SPAZI — le destinazioni con una riga propria nella sidebar, in quest'ordine.
 */
export const NAV_TEAM_SPACES: NavTeamItem[] = [
  // La home del progetto: `/p/<projectId>` rimanda al workbench, quindi sta fra gli `also` o la
  // voce si spegnerebbe appena atterrati.
  { path: '', labelKey: 'app.nav2.home', icon: 'home', also: ['/workbench'] },
  { path: '/media', labelKey: 'app.nav2.materials', icon: 'images' },
  { path: '/calendar', labelKey: 'app.hub.publish.calendar', icon: 'calendar', badge: 'content' },
  { path: '/studio', labelKey: 'app.hub.brand.identity', icon: 'palette' }
];

/**
 * FUORI DALLA SIDEBAR DEL BRAND — le destinazioni che esistono, hanno un'etichetta e si aprono da
 * ⌘K e dai link degli agenti, ma NON hanno una riga propria nella barra di `/app`. La nav del
 * PROGETTO le mostra tutte: sono pagine del progetto, non hub del brand.
 *
 * L'elenco resta perché è ancora l'inventario: `goTargetLabelKey` ci prende le etichette delle
 * scorciatoie `g <lettera>`, e il test lo confronta con HUB_TABS — una pagina nuova che non
 * finisce né qui né fra gli Spazi fa fallire la suite, invece di sparire in silenzio.
 */
export const NAV_OFF_SIDEBAR: NavTeamItem[] = [
  { path: '/manual-posting', labelKey: 'app.hub.publish.manualPosting', icon: 'send' },
  { path: '/ads/social', labelKey: 'app.hub.ads.social', icon: 'megaphone', adsOnly: true },
  { path: '/ads/library', labelKey: 'app.hub.ads.library', icon: 'library', adsOnly: true }
];
