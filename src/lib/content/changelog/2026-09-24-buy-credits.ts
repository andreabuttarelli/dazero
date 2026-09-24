import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Buy credits directly from Billing',
  items: [
    'Billing now shows every credit pack as a subscription or a one-time purchase, side by side, with a buy button for each.',
    'One-time credits never expire.',
    'The "Buy credits" link shown when you run out now takes you to the right page.',
    'Purchases stay off until payment processing is fully wired up, so nobody can pay and receive nothing.'
  ]
} satisfies ChangelogEntry;
