import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'The canvas answers the keyboard',
  items: [
    'Press 1 to 4 to drop a text, image, video or web page block straight onto the canvas — the number sits next to each name in the bar.',
    'Press 0 to frame everything, + and - to zoom, and the arrow keys to nudge what you selected, holding Shift to move further.',
    'Select every block with Cmd+A, and drop the selection with Esc.',
    'Shortcuts stay off while you are typing in a prompt or an address, so nothing fires under your hands.',
    'A keyboard button on the canvas bar lists every shortcut.'
  ]
} satisfies ChangelogEntry;
