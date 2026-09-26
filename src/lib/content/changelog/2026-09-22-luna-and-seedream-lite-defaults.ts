import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-22',
  title: 'New default models for text and images',
  items: [
    'New canvas nodes now default to GPT-5.6 Luna for text and Seedream 5 Lite for images.',
    'Nano Banana Pro and Seedream 5 Pro are still available from the model picker — just no longer the default.'
  ]
} satisfies ChangelogEntry;
