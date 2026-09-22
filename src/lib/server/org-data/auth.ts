/**
 * L'INGRESSO DI OGNI ROTTA `/api/v1/org/**`: Bearer JWT o chiave `dazero_`, risolto in UN'org sola.
 *
 * Il nuovo `api_keys` non porta più `permissions.brand_ids` — porta `org_id` NOT NULL: una chiave
 * vale per un'org, non per un elenco di brand da filtrare a mano. `checkApiKeyWriteAccess` in
 * `cli-auth.ts` resta il posto dove `scopes` diventa un rifiuto — qui si ripete lo stesso controllo
 * sul nuovo schema, perché quella funzione legge la vecchia forma della tabella.
 *
 * DUE AUTORITÀ, MAI CONFUSE (§ vedi `query-tool.ts`):
 *
 *   JWT (Supabase, sessione utente)  →  `createUserDb` dà un client anon+JWT: `org_isolation`
 *                                       decide da sola quali righe esistono per questo utente.
 *                                       `resolveOrgId` sceglie QUALE delle sue org, fra quelle
 *                                       che `orgs_members` gli riconosce.
 *   Chiave API (`dazero_…`)          →  nessun JWT esiste: si risolve con service role (l'unico
 *                                       modo di leggere `api_keys` prima di sapere chi è, la stessa
 *                                       ragione già in `SERVICE_ROLE_USES` per `cli-auth.ts`), e
 *                                       l'org è ESATTAMENTE quella della chiave — non una scelta.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';
import { createUserDb, createServiceRoleDb, type Db } from '$lib/server/db/client';
import { SERVICE_ROLE_USES } from '$lib/server/db/service-role-uses';
import type { OrgQueryAuthority } from './query-tool';

export type OrgCaller = {
  authority: OrgQueryAuthority;
  /** Stesso client di `authority.supabase`, tipizzato: per i repository, che vogliono `Db`. */
  db: Db;
  orgId: string;
  userId: string;
  /** Assente sul percorso JWT: nessuna chiave, nessuno scope da controllare. */
  apiKeyId?: string;
  writeAllowed: boolean;
};

export type AuthFailure = { status: number; body: { error: string; message?: string } };

const API_KEY_PREFIXES = ['dazero_', 'anomalia_', '021_live_'];

function isApiKey(token: string): boolean {
  return API_KEY_PREFIXES.some((p) => token.startsWith(p));
}

async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function requireServiceRoleUse(path: string): (typeof SERVICE_ROLE_USES)[number] {
  const use = SERVICE_ROLE_USES.find((u) => u.path.startsWith(path));
  if (!use) {
    throw new Error(`service role senza voce nel registro: ${path}`);
  }
  return use;
}

const API_KEY_USE = requireServiceRoleUse('src/lib/server/org-data/auth.ts');

async function resolveApiKey(token: string): Promise<{ caller: OrgCaller } | { error: AuthFailure }> {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return { error: { status: 500, body: { error: 'server_misconfigured' } } };
  }

  const admin = createClient(publicEnv.PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const keyHash = await hashApiKey(token);
  const { data: row, error } = await admin
    .from('api_keys')
    .select('id, org_id, user_id, scopes, expires_at, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error || !row) {
    return { error: { status: 401, body: { error: 'invalid_api_key' } } };
  }
  if (row.revoked_at) {
    return { error: { status: 401, body: { error: 'revoked_api_key' } } };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { error: { status: 401, body: { error: 'expired_api_key' } } };
  }

  admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id).then(
    () => {},
    () => {}
  );

  const scoped = createServiceRoleDb(API_KEY_USE);

  return {
    caller: {
      authority: { kind: 'service', supabase: scoped as unknown as SupabaseClient },
      db: scoped,
      orgId: row.org_id,
      userId: row.user_id,
      apiKeyId: row.id,
      writeAllowed: (row.scopes ?? []).includes('write')
    }
  };
}

async function resolveJwt(token: string, orgId?: string): Promise<{ caller: OrgCaller } | { error: AuthFailure }> {
  const db: Db = createUserDb(token);
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: { status: 401, body: { error: 'invalid_token' } } };
  }

  const { data: memberships, error: memberError } = await db
    .from('orgs_members')
    .select('org_id')
    .eq('user_id', userData.user.id);

  if (memberError) {
    return { error: { status: 500, body: { error: 'membership_lookup_failed' } } };
  }
  const orgIds = (memberships ?? []).map((m) => m.org_id);
  if (!orgIds.length) {
    return { error: { status: 404, body: { error: 'no_organization' } } };
  }

  const chosen = orgId && orgIds.includes(orgId) ? orgId : orgIds[0];
  // Un `orgId` che non è tra le sue appartenenze non deve dire «esiste ma non è tuo»: risponde
  // esattamente come un id inventato, o la richiesta diventa un modo di scoprire org altrui.
  if (orgId && !orgIds.includes(orgId)) {
    return { error: { status: 404, body: { error: 'org_not_found' } } };
  }

  return {
    caller: {
      authority: { kind: 'rls', supabase: db as unknown as SupabaseClient },
      db,
      orgId: chosen,
      userId: userData.user.id,
      writeAllowed: true
    }
  };
}

/**
 * `orgId`: quale org scegliere quando l'utente ne ha più di una e il chiamante ne ha nominata
 * una — un id di un'altra org non 404-a in modo diverso da un id che non esiste, per costruzione:
 * la stessa domanda, la stessa risposta, mai un'esistenza rivelata a chi non ne fa parte.
 */
export async function resolveOrgCaller(
  bearerToken: string | undefined,
  orgId?: string
): Promise<{ caller: OrgCaller } | { error: AuthFailure }> {
  if (!bearerToken) {
    return { error: { status: 401, body: { error: 'missing_bearer' } } };
  }
  const token = bearerToken.trim();
  if (!token) {
    return { error: { status: 401, body: { error: 'missing_bearer' } } };
  }

  if (isApiKey(token)) {
    const resolved = await resolveApiKey(token);
    if ('error' in resolved) return resolved;
    if (orgId && orgId !== resolved.caller.orgId) {
      return { error: { status: 404, body: { error: 'org_not_found' } } };
    }
    return resolved;
  }

  return resolveJwt(token, orgId);
}
