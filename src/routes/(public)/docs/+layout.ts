import { loadDocsMessages } from '$lib/i18n';

export const prerender = false;

export const load = async () => {
  await loadDocsMessages();
};
