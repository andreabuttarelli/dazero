import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Ten assistant commands retired, and where their work moved',
  items: [
    'Adding a competitor or a Radar source, removing a competitor, a product, a blog term or a Radar source, and marking a memory as used are no longer separate commands: the assistant now adds, edits and removes rows directly in any of your tables.',
    'Reading ad performance is now a direct read of your campaigns and their metrics; launching, pausing and approving ads is unchanged.',
    'Throwing away a proposed editorial plan is now an edit to that proposal, not its own command.',
    'Approve-everything is gone on purpose. The assistant now approves one post at a time, so a misunderstood request can cost one post instead of a week of them.',
    'Deleting rows is capped at 10 per call and refuses the whole call when a filter matches more, so nothing is ever half-deleted.',
    'The assistant\'s handbook now names the new route for every retired command, instead of leaving a dead end.'
  ]
} satisfies ChangelogEntry;
