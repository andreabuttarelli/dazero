import { IntlMessageFormat } from 'intl-messageformat';
import { DEFAULT_LOCALE, isLocale, type Locale } from '$lib/i18n/locale';

// Server-side email copy. We deliberately do NOT use the svelte-i18n store here: it's a
// client/component-oriented singleton, unsafe under concurrent server requests. A plain
// dictionary rendered with intl-messageformat gives us correct ICU plurals per recipient.
// Note: ICU uses ' as an escape char, so we use typographic apostrophes (’) in copy.

type Dict = Record<string, string>;

const EMAIL: Record<Locale, Dict> = {
  en: {
    // Notifica scritta da un agente della chat (notify_user): il testo è suo, la cornice è nostra.
    'agent.subject': '{brand}: {subject}',
    'agent.eyebrow': 'From your {brand} AI agent',
    'agent.cta': 'Open dazero →',
    'agent.footer':
      'You’re getting this because you’re part of the {brand} project on dazero. Manage email and push notifications in Settings.',
    'approval.subject': '{brand}: {count, plural, one {# post} other {# posts}} ready to approve',
    'approval.heading': '{brand}: {count, plural, one {# post} other {# posts}} ready',
    'approval.intro':
      'dazero planned this week. Approve and it’ll post on schedule — no login needed.',
    'approval.cta': 'Approve all & schedule →',
    'approval.footer': 'If you didn’t expect this, just ignore it. Link expires in 3 days.',
    'scheduler.subject':
      '{brand}: {count, plural, one {# new post} other {# new posts}} ready to approve',
    'scheduler.heading': '{brand}: {count, plural, one {# new post} other {# new posts}} ready',
    'scheduler.intro':
      'Your recurring planner just put together {count, plural, one {# on-brand post} other {# on-brand posts}}. Approve and they’ll post on schedule — no login needed.',
    'scheduler.cta': 'Approve all & schedule →',
    'scheduler.footer':
      'dazero runs your planner automatically. Manage or pause it in Settings. Link expires in 3 days.',
    'conflict.subject': '{brand}: {count, plural, one {# time slot is} other {# time slots are}} double-booked',
    'conflict.heading': '{brand}: {count, plural, one {# calendar clash} other {# calendar clashes}}',
    'conflict.intro':
      'You have {count, plural, one {# time slot with two or more posts} other {# time slots with two or more posts each}} set to go out at the same moment. Open the calendar and let the AI rebalance the schedule for you.',
    'conflict.cta': 'Fix the calendar →',
    'conflict.footer': 'On the calendar, tap “Rearrange with AI” and it’ll spread the posts out for you.',
    'recap.subject': '{brand}: your social strategy is ready',
    'recap.heading': '{brand} is ready to launch',
    'recap.intro':
      'dazero finished building your strategy: {competitors, plural, one {# competitor} other {# competitors}} analysed, buyer personas, a {weeks}-week editorial plan and a full strategy report. Review everything and start whenever you are ready.',
    'recap.cta': 'Review & start →',
    'recap.footer':
      'Everything is saved to your workspace — nothing was published. You decide what goes live.',
    'strategy_plan.subject': '{brand}: strategy and editorial plan ready',
    'strategy_plan.heading': 'Strategy and editorial plan ready',
    'strategy_plan.intro':
      'dazero finished studying your market. Your strategy report and {weeks}-week editorial plan for {brand} are ready to review.',
    'strategy_plan.cta': 'Review strategy & plan →',
    'strategy_plan.footer':
      'Nothing was published — open the link to review and continue onboarding whenever you like.',
    'auth.reset.subject': 'Reset your dazero password',
    'auth.reset.heading': 'Reset your password',
    'auth.reset.intro':
      'We got a request to reset the password for your dazero account. Tap the button below to choose a new one. The link expires in 1 hour.',
    'auth.reset.cta': 'Set a new password →',
    'auth.reset.footer': 'If you didn’t request this, you can safely ignore this email — your password won’t change.',
    'recap_weekly.subject': '{brand} — your weekly recap ({week})',
    'recap_weekly.heading': '{brand}: weekly recap',
    'recap_weekly.subheading': 'Week of {week}',
    'recap_weekly.stats_title': 'This week\u2019s numbers',
    'recap_weekly.stat_published': 'Posts published',
    'recap_weekly.stat_engagement': 'Engagement',
    'recap_weekly.stat_impressions': 'Impressions',
    'recap_weekly.delta_label': 'Trend vs last week',
    'recap_weekly.no_prev_data': 'First week \u2014 no comparison data yet',
    'recap_weekly.prev_week': 'last week',
    'recap_weekly.saves': 'Saves',
    'recap_weekly.stat_link_clicks': 'Link clicks',
    'recap_weekly.visual_insights': 'Visual insights',
    'recap_weekly.webkpis.title': 'Rank tracking',
    'recap_weekly.webkpis.summary': 'tracked: {tracked} · improved: {improved} · worsened: {worsened}',
    'recap_weekly.webkpis.top_movers': 'Top improvements',
    'recap_weekly.pending_posts': '{count, plural, one {# post waiting for your approval} other {# posts waiting for your approval}}',
    'recap_weekly.top_post': 'Top post',
    'recap_weekly.weak_reviews.title': 'Weakest media this week',
    'recap_weekly.weak_reviews.lede':
      'These posts scored lowest this week. Want to redo the visual, or leave them as-is?',
    'recap_weekly.weak_reviews.open_post': 'Open post \u2192',
    'recap_weekly.weak_reviews.see_all': 'See all reviews \u2192',
    'recap_weekly.weak_reviews.verdict.fix': 'Needs a fix',
    'recap_weekly.weak_reviews.verdict.kill': 'Redo',
    'recap_weekly.weak_reviews.verdict.ship': 'OK',
    'recap_weekly.weak_reviews.score': '{score}/10',
    'recap_weekly.by_platform': 'By platform',
    'recap_weekly.trends': 'Trending in your space',
    'recap_weekly.suggestions': 'AI suggestions',
    'recap_weekly.actions': 'Action items',
    'recap_weekly.scheduled': 'scheduled',
    'recap_weekly.connected_accounts': 'Connected accounts',
    'recap_weekly.accounts_note': 'Data collected from these platforms.',
    'recap_weekly.no_accounts_title': 'No social accounts connected',
    'recap_weekly.no_accounts_desc': 'Connect your social accounts so dazero can publish posts, track engagement, and give you better suggestions.',
    'recap_weekly.cta': 'Open dashboard \u2192',
    'recap_weekly.footer': 'Sent every Monday by dazero. Manage your preferences in Settings.',
    'recap_weekly.growth.title': 'Growth data readiness',
    'recap_weekly.growth.blocked': '{n, plural, one {# required fix before produce} other {# required fixes before produce}}',
    'recap_weekly.growth.warn': '{n, plural, one {# recommended improvement} other {# recommended improvements}}',
    'recap_weekly.growth.lede_blocked':
      'Produce and autopilot are paused until you fix the items below. Thin brand data yields generic posts that will not grow organically.',
    'recap_weekly.growth.lede_warn':
      'You can produce, but strengthening these inputs makes captions and visuals more distinctive.',
    'recap_weekly.growth.fix': 'Fix \u2192',
    'recap_weekly.growth.required': 'Required',
    'recap_weekly.growth.check.about': 'Add a clear brand About in Studio',
    'recap_weekly.growth.check.voice': 'Define voice / personality',
    'recap_weekly.growth.check.history': 'Sync at least 5 past posts with metrics',
    'recap_weekly.growth.check.historyDepth': 'Sync more past posts (aim for 12+)',
    'recap_weekly.growth.check.competitors': 'Add at least one competitor',
    'recap_weekly.growth.check.audience': 'Define the target audience',
    'recap_weekly.growth.check.products': 'Add products / services',
    'recap_weekly.growth.check.visual': 'Set visual style',
    'recap_weekly.growth.check.knowledge': 'Add Studio Knowledge notes or docs',
    'recap_weekly.growth.check.plan': 'Approve an editorial plan with personality',
    'digest.subject': 'Yesterday on {brand}: {count, plural, one {# post} other {# posts}}',
    'digest.heading': '{brand}: {count, plural, one {# post} other {# posts}} published yesterday',
    'digest.intro':
      'Here’s what went live for {brand} yesterday — tap a post to see it live.',
    'digest.footer': 'Sent daily by dazero. Manage your preferences in Settings.',
    'invite.subject': '{inviter} invited you to {brand} on dazero',
    'invite.heading': 'Join {brand} on dazero',
    'invite.intro':
      '{inviter} invited you to collaborate on {brand}. Accept the invite to plan, review and manage its content together.',
    'invite.cta': 'Accept invite \u2192',
    'invite.footer':
      'The invite expires in 7 days. If you don\u2019t have an dazero account yet, sign up with this email address ({email}) to see it.',
    'credit_warning.subject': '{brand}: {percent}% of AI credits used',
    'credit_warning.heading': 'AI credits alert',
    'credit_warning.intro':
      '{brand} has used {used} of {quota} AI credits this billing period ({percent}%). Your credits reset on {resetDate}.',
    'credit_warning.cta': 'View usage \u2192',
    'credit_warning.footer':
      'Upgrade your plan for more credits, or wait for the reset. This is a one-time alert per billing period.',
    // ── Lifecycle drip (welcome + day-1 call + day-2/3 next-step) ────────────────────────────
    'welcome.subject': 'Welcome to dazero 👋 let’s set up {brand}',
    'welcome.heading': 'Welcome to dazero, {name} 👋',
    'welcome.intro':
      'From here, AI plans, writes and designs your social content in {brand}’s voice. You just approve — the rest runs on autopilot.',
    'welcome.call_lead':
      'The fastest way to start right? 15 minutes with us: we set your brand up and show you how to ship a full week of content in 10 minutes.',
    'welcome.cta': 'Book your call →',
    'welcome.steps_title': 'Your next steps to set up {brand}:',
    'welcome.step.studio': 'Complete Brand Studio',
    'welcome.step.strategy': 'Generate your strategy',
    'welcome.step.plan': 'Generate your editorial plan',
    'welcome.step.blog': 'Customize your blog',
    'welcome.step.seo': 'SEO/GEO analysis for your site',
    'welcome.footer': 'Questions? Just reply to this email — it comes straight to us.',
    'lifecycle.day1.subject': '{name}, 15 minutes to get {brand} live?',
    'lifecycle.day1.heading': 'Let’s set up {brand} together',
    'lifecycle.day1.intro':
      'Yesterday you created {brand} on dazero — don’t leave it half-done. The “wow” moment (a full week of on-brand posts) is just a couple of steps away.',
    'lifecycle.day1.body':
      'Easiest way is to do it together: 15 minutes, we set it all up and you leave with your first week ready.',
    'lifecycle.cta_call': 'Book your call →',
    'lifecycle.or_self': 'Prefer solo? Pick up your next steps:',
    'lifecycle.footer': 'Reply to this email anytime — it comes straight to us.',
    'lifecycle.step.subject': '{brand}: your next step → {step}',
    'lifecycle.step.heading': '{brand}: your next step',
    'lifecycle.step.intro_day3': 'Still a step away — let’s not lose momentum.',
    'lifecycle.step.or_call': 'Want us to do it with you? Book 15 minutes:',
    'lifecycle.step.cta_call': 'Book a call →',
    'lifecycle.step.title.studio': 'Complete Brand Studio',
    'lifecycle.step.title.strategy': 'Generate your strategy',
    'lifecycle.step.title.plan': 'Generate your editorial plan',
    'lifecycle.step.title.generate': 'Generate your content',
    'lifecycle.step.title.approve': 'Approve your posts',
    'lifecycle.step.title.connect': 'Connect your socials',
    'lifecycle.step.title.publish': 'Go live',
    'lifecycle.step.line.studio': 'Give dazero a little more about {brand} so it can write just like you.',
    'lifecycle.step.line.strategy': 'Your Brand Studio is set 👏 Now generate your strategy — it guides every post.',
    'lifecycle.step.line.plan': 'Your strategy is ready 👏 Next, generate your editorial plan.',
    'lifecycle.step.line.generate': 'Your editorial plan is ready 👏 Time for the fun part: generate your first week of posts.',
    'lifecycle.step.line.approve': 'Your week of posts is ready 👏 Review and approve them.',
    'lifecycle.step.line.connect': 'Posts approved 👏 Connect your social accounts to publish.',
    'lifecycle.step.line.publish': 'You’re connected 👏 Turn on autopilot and go live.',
    'prepublish.subject':
      '{brand}: {count, plural, one {# scheduled post was held back} other {# scheduled posts were held back}}',
    'prepublish.heading':
      '{brand}: {count, plural, one {a post did not go live} other {# posts did not go live}}',
    'prepublish.intro':
      'dazero stopped this from publishing because it looked broken or empty. It is back in your drafts — fix it and approve again.',
    'prepublish.reason': 'Why: {reason}',
    'prepublish.cta': 'Open drafts →',
    'prepublish.footer': 'This last-minute check runs just before publish so empty or broken posts never go out.'
  }
};

export function emailLocale(v: string | null | undefined): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export function tEmail(locale: Locale, key: string, vars?: Record<string, unknown>): string {
  const dict = EMAIL[locale] ?? EMAIL[DEFAULT_LOCALE];
  const msg = dict[key] ?? EMAIL[DEFAULT_LOCALE][key] ?? key;
  return new IntlMessageFormat(msg, locale).format(vars) as string;
}
