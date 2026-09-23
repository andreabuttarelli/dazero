import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-23',
  title: 'The canvas now fills the screen',
  items: [
    'Opening a project now lands directly on the canvas — the old dashboard page is gone.',
    'A floating rail on the left opens Assets and Brands as a panel beside the canvas, and Ads and Settings as a large sheet on top of it — press Esc, or the close button, to get back to the canvas exactly as it was.',
    'Chat now lives in a resizable panel on the right, collapsible to a single button.',
    'On phones, the canvas has its own bottom tab bar — Canvas, Chat, Ads, and More for everything else.'
  ]
} satisfies ChangelogEntry;
