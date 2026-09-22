import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-22',
  title: 'Brand settings rebuilt, People removed',
  items: [
    'Settings → Brand now edits exactly what a brand is: logo, name, website, short description and content — the old page showed fields that no longer applied.',
    'The People feature (adding real or AI-generated faces for your brand) is removed.',
    'A project with no brand yet now shows a picker to attach an existing brand or create a new one, instead of an error.'
  ]
} satisfies ChangelogEntry;
