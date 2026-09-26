import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Nothing posts on its own any more',
  items: [
    'The weekly autopilot is gone: no cron plans, produces, approves or schedules a week of posts by itself.',
    'The Automations page and the recurring "content producer" job are gone with it.',
    'Publishing is unchanged: approving a post still sends it out, on demand, exactly as before.',
    'Blog articles, the editorial plan and the weekly recap email all keep working.'
  ]
} satisfies ChangelogEntry;
