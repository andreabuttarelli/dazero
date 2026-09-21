import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Anomalia is now dazero',
  items: [
    'The product is called dazero and lives at dazero.co.',
    'The command-line tool is now `dazero`: install it again, or rename the binary you already have.',
    'After updating, run `dazero login` once — the saved session moved to a new place.',
    'New API keys start with `dazero_`. The keys you already issued keep working.'
  ]
} satisfies ChangelogEntry;
