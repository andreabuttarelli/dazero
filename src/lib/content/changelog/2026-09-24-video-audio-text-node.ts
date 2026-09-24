import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'A video or audio node can now feed a text node',
  items: [
    'A text node wired to an upstream video or audio clip now generates instead of failing.'
  ]
} satisfies ChangelogEntry;
