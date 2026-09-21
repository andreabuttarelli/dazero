import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Deleting on the canvas now sticks',
  items: [
    'Blocks and connections you delete stay deleted — they no longer reappear a moment later, or after a reload.',
    'Backspace now removes a selected connection too, not just blocks.',
    'Deleting a block takes its connections with it, so no line is left pointing at nothing.',
    'Everything disappears the instant you press the key, and comes back with a note if it could not be saved.'
  ]
} satisfies ChangelogEntry;
