import type { SupabaseClient } from '@supabase/supabase-js';
import { isRlsScoped } from '$lib/server/rls-client';

// Flags rarely change and serverless instances are reused (Fluid Compute), so a short
// in-memory TTL cache saves an RPC per request without meaningfully delaying rollout of a
// flag toggle. 60s is long enough to matter under load, short enough that nobody notices.
const flagCache = new Map<string, { value: boolean; expires: number }>();
const FLAG_TTL_MS = 60_000;

// Generic flag read for future use.
export async function flagEnabled(
  supabase: SupabaseClient,
  key: string,
  fallback = false
): Promise<boolean> {
  const cacheKey = `${key}:${fallback}`;
  const cached = flagCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const { data, error } = await supabase.rpc('flag_enabled', { p_key: key, p_default: fallback });
  // Never cache a failed read: one transient RPC error would otherwise pin the flag to the
  // wrong value for every request on this instance for a full TTL. Fall back uncached instead.
  if (error) return fallback;
  const value = data === true;
  flagCache.set(cacheKey, { value, expires: Date.now() + FLAG_TTL_MS });
  return value;
}

/**
 * Il brand che il chiamante ha nominato nel corpo è suo? La risposta non sta nel valore — arriva
 * da fuori — ma nelle policy: la SELECT su `brands` restituisce solo i brand di cui sei
 * proprietario dell'org o membro, ed è la stessa regola che `loadBrandForUser` riapplica a mano
 * sul percorso a chiave API. Quindi la domanda si gira al database, col client dell'utente.
 *
 * Un client non marchiato come scoped è service role, o un percorso nuovo che ha dimenticato di
 * marchiarsi: in entrambi i casi la risposta è no, perché un client che scavalca la RLS
 * risponderebbe di sì per il brand di chiunque.
 */
export async function ownsBrand(supabase: SupabaseClient, brandId: string): Promise<boolean> {
  if (!isRlsScoped(supabase)) return false;

  const { data } = await supabase.from('brands').select('id').eq('id', brandId).maybeSingle();
  return Boolean(data);
}
