import { writable } from 'svelte/store';
import type { GuideSlug } from '$lib/content/guides';

export const guideOpenRequest = writable<GuideSlug | null>(null);

export function requestGuide(slug: GuideSlug) {
  guideOpenRequest.set(slug);
}
