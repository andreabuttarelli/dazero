import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Il thread della chat di brand si distingue dagli altri per `surface`, non per una tabella sua:
 * `chat_threads` porta già i thread di post e progetti, e cercare "quello del brand" senza un
 * discriminante pescherebbe il primo che capita.
 */
export const BRAND_AGENT_SURFACE = 'brand_agent';

const THREAD_TITLE = 'Brand';

/**
 * Uno per brand e per utente: entri, ricarichi, sei nella stessa conversazione. La ricerca filtra
 * anche per utente perché due persone dello stesso brand non si leggono la chat a vicenda — la
 * RLS lo impone comunque, ma senza questo filtro il primo SELECT tornerebbe il thread di un
 * collega prima che la RLS entri in gioco.
 */
export async function openBrandThread(
	supabase: SupabaseClient,
	brandId: string,
	userId: string
): Promise<string> {
	const { data: existing } = await supabase
		.from('chat_threads')
		.select('id')
		.eq('brand_id', brandId)
		.eq('user_id', userId)
		.eq('surface', BRAND_AGENT_SURFACE)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();

	if (existing?.id) return existing.id as string;

	const { data, error } = await supabase
		.from('chat_threads')
		.insert({
			brand_id: brandId,
			user_id: userId,
			surface: BRAND_AGENT_SURFACE,
			title: THREAD_TITLE
		})
		.select('id')
		.single();

	if (error) throw new Error(error.message);

	return data.id as string;
}
