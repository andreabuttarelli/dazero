import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-26',
  title: 'Canvas previews and video effects',
  items: [
    'Effects now apply to images or videos, preserve video audio, and return the same media type.',
    'Effects and Composizione nodes now preview their result directly on the canvas without cropping the chosen format.',
    'Running a node no longer interrupts an open Composizione preview.',
    'Composizione opens reliably from its node preview without WebGL texture errors.',
    'Flusso elicoidale stays centered, and the new Colonne oblique layout scrolls a geometric grid in a closed loop.',
    'Nube cinematica now moves readable media through a centered, seamless depth field.',
    'Repeated media now alternate across every composition instead of appearing side by side.',
    'Griglia esplorativa now fills every camera zoom without black edges and zooms out between subjects before focusing the next card.'
  ]
} satisfies ChangelogEntry;
