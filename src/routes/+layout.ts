import '$lib/i18n';
import { waitLocale } from 'svelte-i18n';
import type { LayoutLoad } from './$types';
import { dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

injectAnalytics({ mode: dev ? 'development' : 'production' });

// Runs on server (SSR) and client (hydration) before the tree renders. Awaiting the dictionary
// here is what keeps SSR output and the first client render identical — no flash of raw keys.
export const load: LayoutLoad = async ({ data }) => {
  await waitLocale();
  // Spread so session data from +layout.server.ts reaches child pages.
  return { ...data };
};
