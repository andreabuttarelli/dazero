import type { SupabaseClient } from '@supabase/supabase-js';

export type Turn = { role: 'user' | 'assistant'; content: string };

/**
 * La cronologia viaggia nel prompt a ogni messaggio: senza tetto una conversazione lunga diventa
 * un conto che cresce da solo a ogni turno.
 */
export const HISTORY_LIMIT = 40;

/**
 * Gli ULTIMI messaggi, riordinati in avanti. Letti dal più recente perché una chat lunga deve
 * ricordare quello che è appena successo, e rimessi in ordine perché un modello che legge la
 * conversazione al contrario non va in errore: risponde e basta, a sproposito.
 */
export async function loadTurns(supabase: SupabaseClient, threadId: string): Promise<Turn[]> {
	const { data } = await supabase
		.from('chat_messages')
		.select('role, content')
		.eq('thread_id', threadId)
		.order('created_at', { ascending: false })
		.limit(HISTORY_LIMIT);

	const rows = (data ?? []) as Array<{ role?: string; content?: string | null }>;

	return rows
		.filter((row) => row.content?.trim() && (row.role === 'user' || row.role === 'assistant'))
		.map((row) => ({ role: row.role as Turn['role'], content: row.content as string }))
		.reverse();
}

export async function saveTurn(
	supabase: SupabaseClient,
	turn: {
		threadId: string;
		brandId: string;
		userId: string;
		role: Turn['role'];
		content: string;
		model?: string;
		durationMs?: number;
	}
): Promise<void> {
	const { error } = await supabase.from('chat_messages').insert({
		thread_id: turn.threadId,
		brand_id: turn.brandId,
		user_id: turn.userId,
		role: turn.role,
		content: turn.content,
		model: turn.model ?? null,
		duration_ms: turn.durationMs ?? null
	});

	if (error) throw new Error(error.message);
}
