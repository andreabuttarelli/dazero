import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-19',
  title: 'Edits no longer quietly overwrite each other',
  items: [
    'When you edit a post, the edit can now carry the version you were looking at. If someone else — a colleague, an agent, the autopilot — changed that post while you were working on it, your edit is refused instead of silently replacing theirs, and you are told to take another look.',
    'It is opt-in per edit: changes that do not depend on what was already there still go straight through.'
  ]
} satisfies ChangelogEntry;
