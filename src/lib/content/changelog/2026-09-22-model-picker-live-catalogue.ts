import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-22',
  title: 'Model pickers now show what your account can actually use',
  items: [
    'The image and video model dropdowns (canvas, Settings → Images & video) now list only models that are confirmed live and ready to call — no more picking a model that then fails to render.',
    'If the model catalogue has not finished syncing yet, the dropdown says so instead of showing an empty, unexplained list.'
  ]
} satisfies ChangelogEntry;
