import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-19',
  title: 'A missing key says so, instead of failing as someone else’s error',
  items: [
    'When the AI key is still the placeholder from the example configuration, the app now stops with a named error that points at the setting — instead of sending it out and surfacing an authentication failure from the provider.'
  ]
} satisfies ChangelogEntry;
