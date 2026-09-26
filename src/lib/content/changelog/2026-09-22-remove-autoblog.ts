import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-22',
  title: 'Blog / autoblog article publishing has been removed',
  items: [
    'The blog feature — hosted articles, custom domain, CMS sync, cross-brand backlinks — is gone.',
    'Several background jobs that no longer had work to do (ads sync, analytics review, visual insights, benchmark scoring, designer queue, memory maintenance) have been retired.'
  ]
} satisfies ChangelogEntry;
