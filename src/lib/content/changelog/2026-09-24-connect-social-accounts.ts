import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Connecting a social account works again',
  items: [
    'Fixed: connecting Instagram, TikTok, LinkedIn, Facebook, X, YouTube or Reddit was silently blocked for everyone.',
    'Connecting shows the monthly cost up front, and now checks your credit balance instead of a plan tier.'
  ]
} satisfies ChangelogEntry;
