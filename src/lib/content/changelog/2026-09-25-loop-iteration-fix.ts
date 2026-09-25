import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-25',
  title: 'Loop now uses every list item',
  items: ['Looping over a list feeds each generation its own item, not always the first one.']
} satisfies ChangelogEntry;
