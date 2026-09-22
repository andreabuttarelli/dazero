import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-22',
  title: 'Image nodes on the canvas no longer spin forever',
  items: [
    'A slow image render used to leave its canvas node stuck showing the loading spinner with no error and no result. It now finishes normally, or fails with a readable message you can retry.'
  ]
} satisfies ChangelogEntry;
