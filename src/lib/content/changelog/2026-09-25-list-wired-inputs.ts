import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-25',
  title: 'Wire nodes into a list',
  items: [
    'Lists can now be filled by wiring in image or text nodes, not just by dragging.',
    'Wired items stay live and follow the latest result of the node they come from.',
    'The Loop button counts wired items too.'
  ]
} satisfies ChangelogEntry;
