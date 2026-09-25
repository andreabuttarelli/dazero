/** Persistent shell layout prefs (sidebar). Browser localStorage. */

export const SHELL_PREF_KEYS = {
  sidebarOpen: 'feega.sidebarOpen',
  sidebarPanePx: 'feega.sidebarPanePx',
  sidebarPane: 'feega.sidebarPane',
  chatPanelPx: 'feega.chatPanelPx',
  chatOpen: 'feega.chatOpen',
  chatTab: 'feega.chatTab'
} as const;

const SHELL_PREF_KEYS_LEGACY = {
  sidebarOpen: 'dazero.sidebarOpen',
  sidebarPanePx: 'dazero.sidebarPanePx',
  sidebarPane: 'dazero.sidebarPane',
  chatPanelPx: 'dazero.chatPanelPx',
  chatOpen: 'dazero.chatOpen',
  chatTab: 'dazero.chatTab'
} as const;

export const CHAT_TABS = ['chat', 'guide'] as const;
export type ChatTab = (typeof CHAT_TABS)[number];

export const SIDEBAR_PANES = ['chat', 'pages', 'assets'] as const;
export type SidebarPane = (typeof SIDEBAR_PANES)[number];

/** Cookie kept in sync so SSR / first paint can match the sidebar open state. */
export const SIDEBAR_OPEN_COOKIE = 'sidebar_state';
export const SIDEBAR_OPEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Last brand slug visited — used by `/app` to resume the right project after login. */
export const LAST_BRAND_COOKIE = 'feega_last_brand';
export const LAST_BRAND_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const SIDEBAR_W_DEFAULT = 280;
const SIDEBAR_W_MIN = 220;
const SIDEBAR_W_MAX = 420;

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

const LEGACY_BY_KEY = new Map<string, string>(
  (Object.keys(SHELL_PREF_KEYS) as (keyof typeof SHELL_PREF_KEYS)[]).map((name) => [
    SHELL_PREF_KEYS[name],
    SHELL_PREF_KEYS_LEGACY[name]
  ])
);

function readRaw(key: string): string | null {
  if (!canUseStorage()) return null;
  try {
    const value = localStorage.getItem(key);
    if (value !== null) return value;
    const legacyKey = LEGACY_BY_KEY.get(key);
    return legacyKey ? localStorage.getItem(legacyKey) : null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function readSidebarOpen(fallback = true): boolean {
  const ls = readRaw(SHELL_PREF_KEYS.sidebarOpen);
  if (ls === '0' || ls === 'false') return false;
  if (ls === '1' || ls === 'true') return true;
  const cookie = readCookie(SIDEBAR_OPEN_COOKIE);
  if (cookie === 'false' || cookie === 'true') {
    const open = cookie === 'true';
    // One-time migrate cookie → localStorage
    writeRaw(SHELL_PREF_KEYS.sidebarOpen, open ? 'true' : 'false');
    return open;
  }
  return fallback;
}

export function writeSidebarOpen(open: boolean) {
  writeRaw(SHELL_PREF_KEYS.sidebarOpen, open ? 'true' : 'false');
  writeCookie(SIDEBAR_OPEN_COOKIE, open ? 'true' : 'false', SIDEBAR_OPEN_COOKIE_MAX_AGE);
}

export function readSidebarPanePx(): number {
  const n = Number(readRaw(SHELL_PREF_KEYS.sidebarPanePx));
  if (!Number.isFinite(n)) return SIDEBAR_W_DEFAULT;
  return Math.min(SIDEBAR_W_MAX, Math.max(SIDEBAR_W_MIN, Math.round(n)));
}

export function writeSidebarPanePx(px: number) {
  writeRaw(SHELL_PREF_KEYS.sidebarPanePx, String(Math.round(px)));
}

/** Quale dei tre pannelli era aperto. Un valore fuori vocabolario ripiega invece di rompere. */
export function readSidebarPane(): SidebarPane {
  const raw = readRaw(SHELL_PREF_KEYS.sidebarPane);
  return (SIDEBAR_PANES as readonly string[]).includes(raw ?? '') ? (raw as SidebarPane) : 'pages';
}

export function writeSidebarPane(pane: SidebarPane) {
  writeRaw(SHELL_PREF_KEYS.sidebarPane, pane);
}

export const SHELL_LAYOUT = {
  SIDEBAR_W_DEFAULT,
  SIDEBAR_W_MIN,
  SIDEBAR_W_MAX
} as const;

const CHAT_PANEL_DEFAULT = 340;
const CHAT_PANEL_MIN = 280;
const CHAT_PANEL_MAX = 560;

export const CHAT_PANEL = {
  DEFAULT: CHAT_PANEL_DEFAULT,
  MIN: CHAT_PANEL_MIN,
  MAX: CHAT_PANEL_MAX
} as const;

export function readChatPanelPx(): number {
  const n = Number(readRaw(SHELL_PREF_KEYS.chatPanelPx));
  if (!Number.isFinite(n)) return CHAT_PANEL_DEFAULT;
  return Math.min(CHAT_PANEL_MAX, Math.max(CHAT_PANEL_MIN, Math.round(n)));
}

export function writeChatPanelPx(px: number) {
  writeRaw(SHELL_PREF_KEYS.chatPanelPx, String(Math.round(px)));
}

export function readChatOpen(fallback = true): boolean {
  const raw = readRaw(SHELL_PREF_KEYS.chatOpen);
  if (raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true') return true;
  return fallback;
}

export function writeChatOpen(open: boolean) {
  writeRaw(SHELL_PREF_KEYS.chatOpen, open ? 'true' : 'false');
}

export function readChatTab(): ChatTab {
  const raw = readRaw(SHELL_PREF_KEYS.chatTab);
  return (CHAT_TABS as readonly string[]).includes(raw ?? '') ? (raw as ChatTab) : 'chat';
}

export function writeChatTab(tab: ChatTab) {
  writeRaw(SHELL_PREF_KEYS.chatTab, tab);
}
