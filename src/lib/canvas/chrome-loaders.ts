import { SHEET_PAGE_LOADERS } from './sheet-pages';

export const CHROME_LOADERS = {
  chat: () => import('$lib/components/brand-agent/ChatPanel.svelte'),
  leftPanel: () => import('$lib/components/canvas/CanvasLeftPanel.svelte')
};

export const ENTRY_PREFETCH: Record<string, () => Promise<{ default: unknown }>> = {
  assets: CHROME_LOADERS.leftPanel,
  brands: CHROME_LOADERS.leftPanel,
  influencers: CHROME_LOADERS.leftPanel,
  calendar: SHEET_PAGE_LOADERS.calendar,
  ads: SHEET_PAGE_LOADERS.ads,
  settings: SHEET_PAGE_LOADERS.settingsLayout
};

export function prefetchEntry(entryId: string): void {
  void ENTRY_PREFETCH[entryId]?.().catch(() => undefined);
}
