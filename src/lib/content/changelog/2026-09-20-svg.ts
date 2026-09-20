import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-20',
  title: 'SVG logos belong in the media library',
  items: [
    'You can now upload SVG files to a brand’s media library. Until now the picker accepted them and then dropped them without a word, so the file never arrived.',
    'Vector files are shown whole instead of cropped, on a light background, so a logo with a transparent background stays visible.'
  ]
} satisfies ChangelogEntry;
