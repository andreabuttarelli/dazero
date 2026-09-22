import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'The sidebar chat now works without a brand',
  items: [
    'You can open the assistant on any project, even one with no brand attached — explore a canvas first, decide who it is for later.',
    'The assistant can list and edit canvases, create and connect nodes, and generate text, images and video on them.',
    'Brand and publishing tools only show up when the project has a brand, instead of failing when it does not.',
    'The chat history and the media panel follow the project you are in, not a single brand.'
  ]
} satisfies ChangelogEntry;
