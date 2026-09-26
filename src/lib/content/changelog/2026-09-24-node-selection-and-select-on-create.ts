import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Every node shows the same selection border, and new nodes start selected',
  items: [
    'A selected node now shows a colored border, consistent across every node type on the canvas.',
    'A node you just added, dragged in, or duplicated is now selected right away, ready to edit.'
  ]
} satisfies ChangelogEntry;
