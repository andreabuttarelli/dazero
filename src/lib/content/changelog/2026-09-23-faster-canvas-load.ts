import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-23',
  title: 'Canvases open faster',
  items: [
    'Canvases load and become interactive in about half the time.',
    'Buttons stay dimmed until the page is ready, so an early click is never silently lost.'
  ]
} satisfies ChangelogEntry;
