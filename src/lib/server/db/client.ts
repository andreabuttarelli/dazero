import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';
import { markRlsScoped } from '$lib/server/rls-client';
import type { NarrowedDatabase } from '$lib/server/db/typed-database';
import type { ServiceRoleUse } from '$lib/server/db/service-role-uses';

/**
 * UN CLIENT SOLO, E TIPIZZATO SUL DATABASE NUOVO.
 *
 * I tipi vengono da `supabase gen types` sul progetto nuovo: una colonna che non c'è non
 * compila, e le dieci tabelle che portano lo stesso nome del vecchio schema con colonne diverse
 * smettono di mentire su un `select *`.
 *
 * Due chiavi, due significati, e la differenza non si vede guardando l'oggetto:
 *
 *   anon + JWT  →  Postgres valuta `org_isolation` su ogni riga. È il default.
 *   service     →  `bypassrls`. Legge OGNI org di OGNI cliente.
 *
 * Per questo la seconda non si costruisce chiamando una funzione qualsiasi: esige una voce del
 * registro, che è il posto dove la giustificazione sta scritta accanto a tutte le altre.
 *
 * `NarrowedDatabase` è `Database` con le colonne jsonb validate (`nodes.data` e le altre cinque
 * in `typed-database.ts`) già ristrette alla loro forma vera invece di `Json` — vedi quel file
 * per il perché. Ogni repository che importa `Db` da qui la eredita gratis.
 */
export type Db = SupabaseClient<NarrowedDatabase>;

const AUTH_OFF = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function url(): string {
  const value = publicEnv.PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error('PUBLIC_SUPABASE_URL not configured');
  }
  return value;
}

/** Il client dell'utente: la RLS decide cosa vede, e il marchio lo dichiara ai lettori. */
export function createUserDb(accessToken: string): Db {
  const key = publicEnv.PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('PUBLIC_SUPABASE_ANON_KEY not configured');
  }

  const client = createClient<NarrowedDatabase>(url(), key, {
    ...AUTH_OFF,
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });

  return markRlsScoped(client);
}

/**
 * Il client che scavalca la RLS. L'argomento non è decorativo: senza una voce del registro non
 * si ottiene, e una voce nuova è una riga in un file solo — visibile accanto a tutte le altre.
 */
export function createServiceRoleDb(use: ServiceRoleUse): Db {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  if (!use.why) {
    throw new Error(`service role senza giustificazione: ${use.path}`);
  }

  return createClient<NarrowedDatabase>(url(), key, AUTH_OFF);
}
