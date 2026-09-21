import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Assistants can tidy up, carefully',
  items: [
    'An assistant connected to Anomalia can now remove rows it added by mistake, at most ten at a time and never without naming exactly which ones.',
    'A filter that would catch more than ten is refused whole, so nothing is ever half-removed.'
  ]
} satisfies ChangelogEntry;
