import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-22',
  title: 'External connectors and the old brand-setup pages are gone',
  items: [
    'Connecting external apps (Drive, Notion, GitHub, Gmail and the rest of the connector catalog) is removed, along with outbound webhooks for app events.',
    'The old Studio pages for platforms, hashtags, voice examples, people and products are gone — edit them from Settings → Brand, Settings → People and Settings → Products instead.',
    'Uploading documents and notes for the brand to search is removed — the canvas is now where brand knowledge lives.'
  ]
} satisfies ChangelogEntry;
