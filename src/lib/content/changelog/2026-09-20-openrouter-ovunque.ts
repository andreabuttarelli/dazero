import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-20',
  title: 'Every image, clip and word now comes from one provider',
  items: [
    'Images, video, voice-over and writing all run on the same provider. The second one was slower on renders and failed more often, and every job that went through it had to work around something.',
    'An image rejected for showing your logo on clothing is now blocked on every model. On some of them it was being returned anyway.',
    'Runway Aleph and Kling V3 Turbo are gone. Refining a clip still works — Seedance 2.5 and FLUX Video Upscale both read a video you give them.',
    'When a model refuses, you get the reason instead of a silent second attempt that was going to fail too.'
  ]
} satisfies ChangelogEntry;
