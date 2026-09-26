import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Scrolling inside a text node no longer moves the canvas',
  items: [
    'Scrolling with the trackpad over a text node’s prompt or generated text now scrolls that text once it’s tall enough to scroll, instead of panning the canvas underneath it.',
    'An empty text node’s prompt now fills the whole node instead of sitting in a small strip.'
  ]
} satisfies ChangelogEntry;
