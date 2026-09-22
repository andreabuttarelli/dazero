export type WorkbenchPageHub = 'publish' | 'brand' | 'designer' | 'ads';

export const WORKBENCH_HUBS: WorkbenchPageHub[] = ['brand', 'publish', 'ads', 'designer'];

/**
 * Sotto-pagine di ogni hub (sidebar). Le chiavi combaciano con `app.hub.{hub}.{key}`.
 */
export const HUB_TABS: Partial<Record<WorkbenchPageHub, { key: string; path: string; adsOnly?: boolean }[]>> = {
  brand: [{ key: 'identity', path: '/settings/brand' }],
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
  { path: '/settings/brand', labelKey: 'app.hub.brand.identity', icon: 'palette' }
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
