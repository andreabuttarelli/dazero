import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { markRlsScoped } from '$lib/server/rls-client';

/**
 * The new `api_keys` (org_id NOT NULL, scopes: string[]) has no per-brand scoping column — a key
 * is now good for every brand of ONE org, not a chosen list. `permissions.brand_ids` has no
 * successor: brand-level API key scoping is a genuine product gap on this schema, not something
 * repointed here — see the task report. `checkApiKeyBrandAccess` below checks org membership,
 * the only scoping the schema can still express.
 */
export interface ApiKeyInfo {
  id: string;
  name: string;
  user_id: string;
  org_id: string;
  scopes: string[];
}

/**
 * Authenticate a CLI/API request via Bearer token.
 * Supports two token types:
 *   1. Supabase JWT (standard session token)
 *   2. API Key (starts with "dazero_", long-lived, hashed in DB)
 *
 * Returns the Supabase client scoped to the user, or an error Response.
 */
type Caller =
  | { supabase: SupabaseClient; user: { id: string; email?: string }; apiKey?: ApiKeyInfo; error?: undefined }
  | { supabase?: undefined; user?: undefined; apiKey?: undefined; error: Response };

export async function authenticate(request: Request): Promise<Caller> {
  return resolveCaller(request);
}

async function resolveCaller(request: Request): Promise<Caller> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { error: json({ error: 'Missing or invalid Authorization header' }, { status: 401 }) };
  }
  const token = auth.slice(7);

  // ── API Key path ──────────────────────────────────────────────
  // legacy 021_live_* and anomalia_* prefixes migrated from the pre-renaming eras
  if (
    token.startsWith('dazero_') ||
    token.startsWith('anomalia_') ||
    token.startsWith('021_live_')
  ) {
    const res = await authenticateApiKey(token);
    if ('error' in res && res.error) return res;
    // Write scope, enforced once here instead of per-route: a read-only key may only ever read.
    // Every mutating CLI route is a non-GET, so the method is the whole check.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const denied = checkApiKeyWriteAccess((res as { apiKey: ApiKeyInfo }).apiKey);
      if (denied) return { error: denied };
    }
    return res;
  }

  // ── Supabase JWT path (existing) ─────────────────────────────
  const supabase = createServerClient(publicEnv.PUBLIC_SUPABASE_URL, publicEnv.PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: () => {}
    },
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { error: json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }

  // Chiave anon + il JWT dell'utente: Postgres valuta le sue policy, esattamente come nel browser.
  // Il marchio si DICHIARA perché il client, guardato da fuori, è indistinguibile dalla service
  // role — e la sessione qui non c'è: i cookie sono a vuoto per costruzione, non per errore.
  return { supabase: markRlsScoped(supabase), user };
}

async function authenticateApiKey(token: string) {
  const keyHash = await hashApiKey(token);

  // Service-role client to look up the key (bypasses RLS)
  const adminKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!adminKey) {
    return { error: json({ error: 'Server misconfiguration' }, { status: 500 }) };
  }
  const admin = createClient(publicEnv.PUBLIC_SUPABASE_URL, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: keyRow, error: lookupError } = await admin
    .from('api_keys')
    .select('id, user_id, org_id, name, scopes, expires_at, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (lookupError || !keyRow) {
    return { error: json({ error: 'Invalid API key' }, { status: 401 }) };
  }
  if (keyRow.revoked_at) {
    return { error: json({ error: 'Invalid API key' }, { status: 401 }) };
  }
  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() < Date.now()) {
    return { error: json({ error: 'Invalid API key' }, { status: 401 }) };
  }

  // Fire-and-forget: update last_used_at
  admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id);

  const apiKey: ApiKeyInfo = {
    id: keyRow.id,
    name: keyRow.name,
    user_id: keyRow.user_id,
    org_id: keyRow.org_id,
    scopes: keyRow.scopes ?? []
  };

  // Service-role client: it bypasses RLS, so the ownership check RLS would have done has to be
  // redone by hand. Registering the identity here is what lets loadBrandForUser do it — the alternative
  // (remembering a permission call in each of ~60 routes) is what left the tenant boundary open.
  const supabase = createClient(publicEnv.PUBLIC_SUPABASE_URL, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  apiKeyIdentity.set(supabase, { userId: keyRow.user_id, apiKey });

  return {
    supabase,
    user: { id: keyRow.user_id },
    apiKey
  };
}

/**
 * Who is behind a service-role client handed out for an API key. Keyed by the client itself so the
 * check lands in loadBrandForUser without changing every call site.
 */
const apiKeyIdentity = new WeakMap<SupabaseClient, { userId: string; apiKey: ApiKeyInfo }>();

/**
 * Mirrors the RLS org_isolation predicate: brands of every org this user belongs to (any role —
 * `brand_members` has no successor on the new schema, so membership is org-wide, not per-brand).
 */
async function accessibleBrandIds(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data: memberships } = await admin.from('orgs_members').select('org_id').eq('user_id', userId);
  const orgIds = (memberships ?? []).map((m: any) => m.org_id);
  if (!orgIds.length) return [];

  const { data } = await admin.from('brands').select('id').in('org_id', orgIds);
  return (data ?? []).map((b: any) => b.id);
}

/**
 * Brand ids this request is allowed to touch — the user's own brands narrowed to the key's org.
 * Returns null for JWT auth, where the client is already RLS-scoped and no filtering is needed.
 */
export async function apiKeyBrandIds(supabase: SupabaseClient): Promise<string[] | null> {
  const identity = apiKeyIdentity.get(supabase);
  if (!identity) return null;
  const owned = await accessibleBrandIds(supabase, identity.userId);
  const { data } = await supabase.from('brands').select('id').eq('org_id', identity.apiKey.org_id);
  const inKeyOrg = new Set((data ?? []).map((b: any) => b.id));
  return owned.filter((id) => inKeyOrg.has(id));
}

/** Hash an API key with SHA-256, returns hex string. */
export async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a new API key. Returns the raw key (show once) and the hash (store). */
export async function generateApiKey(): Promise<{ raw: string; hash: string; prefix: string }> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const raw = `dazero_live_${hex}`;
  const hash = await hashApiKey(raw);
  const prefix = raw.slice(0, 16); // "dazero_live_<first 8 hex>"
  return { raw, hash, prefix };
}

// ── API Key permission helpers ─────────────────────────────────

/**
 * Check if an API key has access to a specific brand — i.e. the brand's org is the key's org.
 * Returns undefined if allowed, or a 403 Response if denied.
 * For JWT auth (no apiKey), this is a no-op — RLS handles it.
 */
export function checkApiKeyBrandAccess(
  apiKey: ApiKeyInfo | undefined,
  brand: { org_id: string }
): Response | undefined {
  if (!apiKey) return undefined; // JWT auth — RLS handles it
  if (brand.org_id === apiKey.org_id) return undefined;
  return json({ error: 'API key does not have access to this brand' }, { status: 403 });
}

/**
 * Check if an API key has write permission.
 * Returns undefined if allowed, or a 403 Response if denied.
 * For JWT auth (no apiKey), this is a no-op.
 */
export function checkApiKeyWriteAccess(
  apiKey: ApiKeyInfo | undefined
): Response | undefined {
  if (!apiKey) return undefined; // JWT auth
  if (apiKey.scopes.includes('write')) return undefined;
  return json({ error: 'API key is read-only' }, { status: 403 });
}

/**
 * L'esito di un cancello crediti, indipendente da come chi ha chiamato deve restituirlo: una
 * rotta API vuole una `Response`, una form action di SvelteKit vuole un oggetto che `fail()`
 * costruisce — restituire una `Response` da un'azione fallisce a runtime con "Data returned from
 * action … is not serializable", e chi guarda vede un errore generico al posto di "crediti
 * finiti". Un solo controllo del saldo (qui sotto), due modi di raccontarne il rifiuto.
 */
export type CreditGateDenial = { status: number; data: { error: string; message: string } };

const CREDITS_EXHAUSTED_MESSAGE = 'AI credits are exhausted for this billing period. Buy more to continue.';

async function creditGateOutcome(spend: () => Promise<void>): Promise<CreditGateDenial | undefined> {
  const { CreditsExhaustedError } = await import('./credits');
  try {
    await spend();
  } catch (e) {
    if (e instanceof CreditsExhaustedError) {
      return { status: 402, data: { error: 'credits_exhausted', message: CREDITS_EXHAUSTED_MESSAGE } };
    }
    throw e;
  }
  return undefined;
}

/**
 * Gate an AI-spending CLI action: credits left (free matches Go for feature access).
 * Returns undefined if allowed, or the Response to return.
 */
export async function gateAiAction(
  brand: { id: string; plan?: unknown },
  apiKey: ApiKeyInfo | undefined
): Promise<Response | undefined> {
  const write = checkApiKeyWriteAccess(apiKey);
  if (write) return write;

  const { gateCredits } = await import('./credits');
  const denial = await creditGateOutcome(() => gateCredits(brand.id));
  return denial ? json(denial.data, { status: denial.status }) : undefined;
}

/** Lo stesso cancello di gateAiAction, per una form action: nessuna Response, un esito per fail(). */
export async function gateAiActionForForm(brandId: string): Promise<CreditGateDenial | undefined> {
  const { gateCredits } = await import('./credits');
  return creditGateOutcome(() => gateCredits(brandId));
}

/**
 * Lo stesso cancello per un'azione che un brand non ce l'ha: paga l'organizzazione, e senza questo
 * la strada nuova sarebbe l'unica del prodotto a spendere senza controllare il saldo.
 */
export async function gateOrgAiAction(
  orgId: string,
  apiKey: ApiKeyInfo | undefined
): Promise<Response | undefined> {
  const write = checkApiKeyWriteAccess(apiKey);
  if (write) return write;

  const { gateOrgCredits } = await import('./credits');
  const denial = await creditGateOutcome(() => gateOrgCredits(orgId));
  return denial ? json(denial.data, { status: denial.status }) : undefined;
}

/** Lo stesso cancello di gateOrgAiAction, per una form action: nessuna Response, un esito per fail(). */
export async function gateOrgAiActionForForm(orgId: string): Promise<CreditGateDenial | undefined> {
  const { gateOrgCredits } = await import('./credits');
  return creditGateOutcome(() => gateOrgCredits(orgId));
}

/**
 * Una chiave API vale sempre per una sola org (`api_keys.org_id`, NOT NULL sul nuovo schema): la
 * vecchia distinzione fra "tutti i brand" e "solo alcuni" non ha più una colonna da cui leggersi,
 * e con essa il rifiuto in `orgScopeFor` — una chiave qualunque ORA ha un'org sola e ben definita,
 * la propria, quindi passa sempre; era il caso "* " di prima, non quello ristretto.
 */
export function apiKeyIsBrandScoped(_apiKey: ApiKeyInfo | undefined): boolean {
  return false;
}

export type OrgScope = {
  supabase: SupabaseClient;
  user: { id: string; email?: string };
  orgId: string;
  /** Chi ha pagato, per nome: il chiamante non l'ha scelto, quindi la risposta glielo dice. */
  organization: { id: string; name: string | null };
  apiKey?: ApiKeyInfo;
};

/**
 * L'ingresso di OGNI rotta che genera senza un brand, in un posto solo — perché le domande che una
 * strada senza brand solleva hanno una risposta sola, e scritta quattro volte divergerebbe al
 * primo cambio:
 *
 *   chi paga         →  l'organizzazione dell'utente, con la stessa regola con cui atterra un
 *                       brand nuovo (pagante prima, poi la più vecchia). Nessuna → ci si ferma.
 *                       Andrea ha visto agenti scegliere un brand a caso pur di avere un addebito
 *                       che nessuno controlla: è il motivo per cui questa strada esiste.
 *   chiave ristretta →  si RIFIUTA, non si allarga: è una restrizione che l'utente ha scelto.
 *   crediti          →  lo stesso cancello del brand, sul saldo dell'organizzazione.
 */
export async function openOrgScope(
  request: Request
): Promise<{ scope: OrgScope; error?: undefined } | { scope?: undefined; error: Response }> {
  return orgScopeFor(await authenticate(request));
}

/**
 * La parte che DECIDE, separata da quella che autentica. Sono due mestieri, e tenerli insieme
 * rendeva i rifiuti raggiungibili solo passando da una chiave API vera: qui si provano per quello
 * che sono, uno per uno.
 */
export async function orgScopeFor(
  caller: Caller
): Promise<{ scope: OrgScope; error?: undefined } | { scope?: undefined; error: Response }> {
  const { supabase, user, error, apiKey } = caller;
  if (error) return { error };

  // A key's org is fixed by the row (api_keys.org_id) — there is nothing left to resolve. Only a
  // JWT caller, who may belong to several orgs, needs ensureOrgForUser to pick one.
  let orgId: string | null;
  if (apiKey) {
    orgId = apiKey.org_id;
  } else {
    const { ensureOrgForUser } = await import('./org');
    orgId = await ensureOrgForUser(supabase, user as never);
  }
  if (!orgId) return { error: json({ error: 'no_organization' }, { status: 500 }) };

  const gate = await gateOrgAiAction(orgId, apiKey);
  if (gate) return { error: gate };

  const { data } = await supabase.from('orgs').select('id, name').eq('id', orgId).maybeSingle();

  return {
    scope: {
      supabase,
      user,
      orgId,
      organization: { id: orgId, name: (data?.name as string | null | undefined) ?? null },
      apiKey
    }
  };
}

/**
 * Lo stile di un brand chiesto dove un brand non c'è. Un default silenzioso consegnerebbe qualcosa
 * che nessuno ha chiesto: qui si dice la mossa, identica su ogni rotta che accetta il campo.
 */
export function brandStyleRefusal(brandStyle: string | undefined): Response | undefined {
  if (!brandStyle) return undefined;

  return json(
    {
      error: 'brand_style_needs_a_brand',
      reason:
        'brand_style governs a brand look, and no brand was named — pass a slug, or drop brand_style.'
    },
    { status: 400 }
  );
}

/**
 * The columns loadBrandForUser selects — typed, so callers don't get `unknown` everywhere.
 *
 * `status`, `plan`, `timezone`, `target_platforms`, `launched_at`, `content_prefs`, `setup_step`,
 * `setup_completed_at`, `zernio_profile_id`, `ads_settings` are NOT columns on the new `brands`
 * (verified against database.types.ts — it has only id, org_id, name, slug, website,
 * short_description, content, palette, target, logo_url, created_at, updated_at). They stay in
 * the type with safe defaults below so the ~60 call sites across api/v1/brands/[slug]/** that
 * read them still compile; their RUNTIME behavior against fields the database no longer has is a
 * separate, much larger defect than the auth path fixed here — see the task report.
 */
export type CliBrand = {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  status: string;
  plan: string | null;
  timezone: string;
  target_platforms: string[] | null;
  launched_at: string | null;
  content_prefs: Record<string, unknown> | null;
  setup_step: string | null;
  setup_completed_at: string | null;
  zernio_profile_id: string | null;
  ads_settings: unknown;
} & Record<string, unknown>;

const CLI_BRAND_DEFAULTS = {
  status: 'active',
  plan: null,
  timezone: 'Europe/Rome',
  target_platforms: null,
  launched_at: null,
  content_prefs: null,
  setup_step: null,
  setup_completed_at: null,
  zernio_profile_id: null,
  ads_settings: null
} as const;

/**
 * Load a brand by slug, verifying it belongs to the authenticated user via RLS.
 *
 * API-key requests run as service-role (RLS bypassed), so when `apiKey` is present the tenant
 * boundary is re-applied by hand: the brand's org must be the key's org — the only scoping the
 * new `api_keys` can still express (see ApiKeyInfo's doc). 404 (not 403) — an API key must not
 * be able to probe which slugs exist.
 */
export async function loadBrandForUser(
  supabase: SupabaseClient,
  slug: string,
  apiKey?: ApiKeyInfo | undefined
): Promise<{ brand: CliBrand; error?: undefined }
  | { brand?: undefined; error: Response }
> {
  // Service-role (API key) can see every row for a slug; JWT+RLS usually returns one.
  // Never maybeSingle() here — duplicate trial rows for the same slug exist in prod.
  const { data: rows, error } = await supabase.from('brands').select('id, org_id, name, slug').eq('slug', slug);

  if (error || !rows?.length) {
    return { error: json({ error: 'Brand not found' }, { status: 404 }) };
  }

  let candidates = (rows as { id: string; org_id: string; name: string; slug: string }[]).map(
    (row) => ({ ...CLI_BRAND_DEFAULTS, ...row }) as CliBrand
  );

  // API-key path: the client bypassed RLS, so re-apply the tenant boundary by hand.
  if (apiKey) {
    candidates = candidates.filter((brand) => !checkApiKeyBrandAccess(apiKey, brand));
  }

  // Defense in depth: catches callers that forgot to pass `apiKey` while the client is still
  // registered in the API-key identity map. No-op for JWT and for callers that passed apiKey.
  const allowed = await apiKeyBrandIds(supabase);
  if (allowed) {
    candidates = candidates.filter((b) => allowed.includes(b.id));
  }

  if (!candidates.length) {
    return { error: json({ error: 'Brand not found' }, { status: 404 }) };
  }

  // Used to prefer the live brand on a slug collision (active > trial, launched first) via
  // status/launched_at/plan — none of those columns exist on the new `brands` (see CliBrand's
  // doc), so a collision now returns whichever row the query happens to return first. Slugs are
  // unique in practice; this is a real loss of a tiebreak, not a bug introduced here.
  return { brand: candidates[0] };
}
