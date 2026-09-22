import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-22',
  title: 'Image nodes now say why a render could not be saved',
  items: [
    'When an image node fails to save its result, it now shows the real reason instead of a generic error, so you know whether to retry or report it.'
  ]
} satisfies ChangelogEntry;
