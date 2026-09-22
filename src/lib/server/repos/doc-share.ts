import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocShareRow } from '$lib/canvas/doc-node';

type Json = Database['public']['Tables']['nodes']['Row']['data'];

/**
 * IL LINK PUBBLICO DI UN DOCUMENTO, lato database.
 *
 * Il token in chiaro non arriva mai qui: solo l'impronta, sulle colonne della riga. La lettura
 * anonima filtra su quell'impronta e non porta `org_id` — è l'unica eccezione della casa, come
 * `shared_views`: chi apre il link non ha un'org, e il token È l'autorizzazione.
 */

type DocShareColumns = {
  data: Record<string, unknown> | null;
  public_token_hash: string | null;
  public_expires_at: string | null;
};

export async function setDocShare(
  db: Db,
  input: {
    orgId: string;
    nodeId: string;
    data: Record<string, unknown>;
    tokenHash: string;
    expiresAt: string | null;
  }
): Promise<void> {
  const { error } = await db
    .from('nodes')
    .update({
      data: input.data as Json,
      public_token_hash: input.tokenHash,
      public_expires_at: input.expiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', input.nodeId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}

export async function clearDocShare(
  db: Db,
  input: { orgId: string; nodeId: string; data: Record<string, unknown> }
): Promise<void> {
  const { error } = await db
    .from('nodes')
    .update({
      data: input.data as Json,
      public_token_hash: null,
      public_expires_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', input.nodeId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}

export async function readSharedDoc(admin: SupabaseClient, tokenHash: string): Promise<DocShareRow | null> {
  const { data, error } = await admin
    .from('nodes')
    .select('data, public_token_hash, public_expires_at')
    .eq('public_token_hash', tokenHash)
    .eq('type', 'doc')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const row = data as DocShareColumns;
  const content = row.data && typeof row.data.content === 'string' ? row.data.content : '';

  return {
    content,
    public_token_hash: row.public_token_hash,
    public_expires_at: row.public_expires_at
  };
}
