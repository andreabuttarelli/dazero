import { json } from '@sveltejs/kit';
import { loadBrandForUser } from '$lib/server/cli-auth';
import { listBrandMedia } from '$lib/server/brand-media';
import { mediaUrl } from '$lib/media-url';
import type { RequestHandler } from './$types';

const PANEL_LIMIT = 60;

/**
 * I media per il pannello della sidebar. Esiste già `/media`, ma quella rotta passa da
 * `authenticate`, che pretende un Bearer: il browser ha un cookie di sessione, non un token. Qui
 * la sessione è la credenziale, e la RLS resta quella del client dell'utente — abbassare la
 * guardia di `/media` per farci entrare un cookie aprirebbe anche tutto il resto della superficie
 * CLI.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

	const { brand, error } = await loadBrandForUser(locals.supabase, params.slug);
	if (error) return error;

	const media = await listBrandMedia(locals.supabase, brand.id, { limit: PANEL_LIMIT });

	return json({
		assets: media.map((m) => ({
			id: m.id,
			kind: m.kind,
			title: m.title,
			url: mediaUrl(m.short_code)
		}))
	});
};
