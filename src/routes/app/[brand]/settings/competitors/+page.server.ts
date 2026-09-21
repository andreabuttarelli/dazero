import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Competitors live in the Studio. */
export const load: PageServerLoad = async ({ params, url }) => {
	const qs = url.searchParams.toString();
	throw redirect(308, `/app/${params.brand}/studio/competitors${qs ? `?${qs}` : ''}`);
};
