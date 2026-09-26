import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-23',
  title: 'Generate several variants in one click',
  items: [
    'A new "repeat" field and a Loop button on generation nodes: pick how many variants you want, and every one runs for real, not just the last click repeated.',
    'Before it runs, you see exactly how many generations and how many credits it will cost — above 50 variants you confirm first, above 1000 it asks you to split the batch.',
    'One variant failing never loses the others: everything that finished stays, and you can see what went wrong.'
  ]
} satisfies ChangelogEntry;
