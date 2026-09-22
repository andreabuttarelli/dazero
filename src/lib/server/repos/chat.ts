import type { Db } from '$lib/server/db/client';
import { actorCols, type Actor } from './actor';

/**
 * I THREAD DELLA CHAT DI PROGETTO, SULLO SCHEMA NUOVO.
 *
 * Un thread per progetto e per utente, discriminato da `surface`: ricarichi e sei nella stessa
 * conversazione, due persone dello stesso progetto non si leggono i messaggi a vicenda.
 * Ogni query porta `org_id` — è la regola di `tenancy.test.ts`, e qui vale anche quando il
 * `project_id` basterebbe a identificare la riga.
 */

export const SIDEBAR_SURFACE = 'sidebar';

/** La cronologia viaggia nel prompt a ogni messaggio: senza tetto il conto cresce da solo. */
export const HISTORY_LIMIT = 40;

export type Turn = { role: 'user' | 'assistant'; content: string };

export async function openThread(
  db: Db,
  input: { orgId: string; projectId: string; userId: string; brandId?: string | null }
): Promise<string> {
  const { data: existing } = await db
    .from('chat_threads')
    .select('id')
    .eq('org_id', input.orgId)
    .eq('project_id', input.projectId)
    .eq('created_by', input.userId)
    .eq('surface', SIDEBAR_SURFACE)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await db
    .from('chat_threads')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId,
      brand_id: input.brandId ?? null,
      created_by: input.userId,
      surface: SIDEBAR_SURFACE,
      title: 'Project'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data.id as string;
}

/** Gli ULTIMI messaggi, rimessi in ordine cronologico: il modello non legge la chat al contrario. */
export async function loadTurns(
  db: Db,
  input: { orgId: string; threadId: string }
): Promise<Turn[]> {
  const { data } = await db
    .from('chat_messages')
    .select('role, content')
    .eq('org_id', input.orgId)
    .eq('thread_id', input.threadId)
    .order('seq', { ascending: false })
    .limit(HISTORY_LIMIT);

  const rows = (data ?? []) as Array<{ role?: string; content?: string | null }>;

  return rows
    .filter((row) => row.content?.trim() && (row.role === 'user' || row.role === 'assistant'))
    .map((row) => ({ role: row.role as Turn['role'], content: row.content as string }))
    .reverse();
}

/**
 * `seq` è obbligatorio e unico per thread: due messaggi nello stesso millisecondo esistono, e
 * l'ordine di una conversazione non può dipendere dall'orologio. Si prende il massimo e si aggiunge.
 */
export async function saveTurn(
  db: Db,
  input: {
    orgId: string;
    threadId: string;
    role: Turn['role'];
    content: string;
    actor: Actor;
  }
): Promise<void> {
  const { data: last } = await db
    .from('chat_messages')
    .select('seq')
    .eq('org_id', input.orgId)
    .eq('thread_id', input.threadId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();

  const seq = Number((last as { seq?: number } | null)?.seq ?? 0) + 1;

  const { error } = await db.from('chat_messages').insert({
    org_id: input.orgId,
    thread_id: input.threadId,
    role: input.role,
    content: input.content,
    seq,
    ...actorCols(input.actor)
  });

  if (error) {
    throw new Error(error.message);
  }
}
