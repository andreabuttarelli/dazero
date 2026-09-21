import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Generate now works on the canvas, and keeps every version',
  items: [
    'The Generate button on a canvas block now actually makes the image or the clip, and the result appears inside the block.',
    'Generating again no longer throws away what came before: every version a block has made stays on it, and you can click back to any of them.',
    'A block that cannot run yet says why instead of leaving the button greyed out with no explanation.',
    'Text blocks do not generate yet, and now say so rather than looking broken.'
  ]
} satisfies ChangelogEntry;
