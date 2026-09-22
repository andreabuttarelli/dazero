import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Studio moved into Settings. */
export const load: PageServerLoad = async ({ params, url }) => {
  const qs = url.searchParams.toString();
  throw redirect(308, `/p/${params.projectId}/settings/brand${qs ? `?${qs}` : ''}`);
};
