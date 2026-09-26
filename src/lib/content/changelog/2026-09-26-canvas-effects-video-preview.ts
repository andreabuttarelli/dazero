import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-26',
  title: 'Canvas previews and video effects',
  items: [
    'Effects now apply to images or videos, preserve video audio, and return the same media type.',
    'Effects and Composizione nodes now preview their result directly on the canvas without cropping the chosen format.',
    'Running a node no longer interrupts an open Composizione preview.'
  ]
} satisfies ChangelogEntry;
