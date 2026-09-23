import type { SupabaseClient } from '@supabase/supabase-js';
import { FREE_CREDITS, PLANS } from '$lib/plans';
import { swallow } from '$lib/server/swallow';

// ── AI Credits: consumption tracking per billing period ─────────────────────────
// Every AI call logs cost_usd in ai_calls (tagged by brand_id via the AsyncLocalStorage
// context). This module sums those costs into "credits" (100 credits = $1 USD) and enforces
// the per-plan monthly quota. Every model is stored at 100% of list — Gemini Flash and Nano
// Banana Pro carried a per-plan discount until 2026-08 and no longer do, so the same quota now
// buys fewer looks and fewer stills. Quotas were NOT adjusted for this; that is a separate call.

export type Brand = {
  id: string;
  plan: string | null;
  activated_at: string | null;
  status: string;
};

export type CreditsUsage = {
  used: number;       // credits consumed this period (rounded)
  quota: number;      // plan quota + active grants
  bonus: number;      // sum of active credit_grants
  remaining: number;  // max(0, quota - used)
  periodStart: Date;
  periodEnd: Date;    // periodStart + 1 month
  percent: number;    // used / quota * 100
};

// ── Plan quotas ──────────────────────────────────────────────────────────────────
// Free (no plan): 400 credits ≈ €10 of API value. Paid tiers share credits with
// src/lib/plans.ts (PlanCards / pricing) so UI and entitlement cannot drift.
// `scale` (legacy grandfathered tier, not in PLANS) is mapped to the Pro quota
// explicitly so it never falls back to the free grant.
const CREDIT_QUOTAS: Record<string, number> = {
  '': FREE_CREDITS,
  ...Object.fromEntries(PLANS.map((p) => [p.key, p.credits])),
  // Legacy grandfathered tier — stessa quota di Pro (scale paga come Pro). Agganciato alla voce di
  // Pro e non a una cifra copiata: quando il prezzo di Pro cambia, questa lo segue.
  scale: PLANS.find((p) => p.key === 'pro')?.credits ?? FREE_CREDITS
};

export function creditQuota(plan: string | null | undefined): number {
  return CREDIT_QUOTAS[plan ?? ''] ?? FREE_CREDITS;
}

// ── Date helpers ─────────────────────────────────────────────────────────────────

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

/**
 * Find the start of the current billing period: the most recent monthly anniversary of
 * `anchor` that is <= `now`. E.g. anchor = Jan 15, now = Mar 3 → start = Feb 15.
 */
function shiftToAnchor(anchor: Date, now: Date): Date {
  const anchorDay = anchor.getUTCDate();
  // Start from the anchor's month in the same year, then walk forward until we pass `now`.
  let candidate = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchorDay));
  // If candidate is in the future relative to now, we need to go back.
  // But it's easier to walk forward from (now - 1 month) to find the right period.
  // Strategy: compute the month difference, then verify.
  const nowTime = now.getTime();
  // Fast path: anchor is in the current month and already passed.
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), anchorDay));
  if (thisMonth.getTime() <= nowTime) return thisMonth;
  // Otherwise the period started last month.
  return addMonths(thisMonth, -1);
}

// ── Billing period ───────────────────────────────────────────────────────────────

/**
 * Current billing window: [period anchor, +1 month).
 * The new schema (`orgs`, `brands`) carries no subscription, so there is no anchor to read live
 * anymore — every period is the calendar month, in UTC. `activated_at` and a Stripe anchor are
 * kept as optional inputs so old callers still compile; neither has a column to come from today.
 */
export function currentBillingPeriod(
  brand: Pick<Brand, 'activated_at'>,
  stripePeriodStart?: Date | null
): { start: Date; end: Date } {
  const anchor = stripePeriodStart
    ?? (brand.activated_at ? new Date(brand.activated_at) : monthStart(new Date()));
  const start = shiftToAnchor(anchor, new Date());
  const end = addMonths(start, 1);
  return { start, end };
}

// ── Org scope ────────────────────────────────────────────────────────────────────
// Spend is pooled at the ORG, not the brand: every brand under an org draws from the same
// ai_calls sum. `getCreditsUsage` reads org-first and falls back to the brand alone only when
// the brand row itself cannot be resolved to an org.

const ORG_BILLING_TTL_MS = 5 * 60_000;

/**
 * `orgs` carries no billing columns on the new schema — no plan, no subscription, no period
 * anchor — and neither does `brands` anymore. Billing has no home yet; see the module doc at the
 * top. `plan`/`activatedAt` are kept in the shape (always null today) so `creditQuota`/
 * `currentBillingPeriod` keep one signature instead of forking for "before" and "after" billing
 * lands somewhere. `billingBrandId` is gone with them — there is no brand left to anchor a period on.
 */
export type OrgBilling = {
  orgId: string;
  plan: string | null;
  activatedAt: string | null;
  brandIds: string[];
};

const orgBillingByBrand = new Map<string, { value: OrgBilling | null; at: number }>();

/** The org a brand belongs to, and every sibling brand under it (the pool spend is shared over). */
export async function resolveOrgBilling(
  supabase: SupabaseClient,
  brandId: string
): Promise<OrgBilling | null> {
  const hit = orgBillingByBrand.get(brandId);
  if (hit && Date.now() - hit.at < ORG_BILLING_TTL_MS) return hit.value;

  const value = await readOrgBilling(supabase, brandId);
  orgBillingByBrand.set(brandId, { value, at: Date.now() });
  return value;
}

async function readOrgBilling(
  supabase: SupabaseClient,
  brandId: string
): Promise<OrgBilling | null> {
  const { data: brand } = await supabase
    .from('brands')
    .select('org_id')
    .eq('id', brandId)
    .maybeSingle();
  const orgId = (brand as { org_id?: string } | null)?.org_id;
  if (!orgId) return null;

  return readOrgBillingById(supabase, orgId);
}

/** The same reading for a caller that already holds the org and has no brand to reach it through. */
export async function readOrgBillingById(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgBilling | null> {
  const { data: org } = await supabase.from('orgs').select('id').eq('id', orgId).maybeSingle();
  if (!org) return null;

  const { data: brands } = await supabase.from('brands').select('id').eq('org_id', orgId);

  return {
    orgId,
    plan: null,
    activatedAt: null,
    brandIds: (brands ?? []).map((b) => (b as { id: string }).id)
  };
}

/**
 * The plan the org bills on. Always null today — kept as a function (not inlined at the two call
 * sites) so the day billing gets a real column, one place answers instead of two.
 */
export async function orgPlanForBrand(
  supabase: SupabaseClient,
  brandId: string
): Promise<string | null> {
  return (await resolveOrgBilling(supabase, brandId))?.plan ?? null;
}

// ── Ledger balance ───────────────────────────────────────────────────────────────
// Il saldo vero: `credit_ledger` sommato (grant − debit, righe non scadute), letto dalla RPC
// `org_credit_balance` — non da `ai_calls` sommato contro una quota fissa (vedi sotto). Ogni
// chiamata AI prezzata scrive già un debito qui (ai-log.ts): questo è l'unico posto che LEGGE
// quel saldo per decidere se una spesa nuova può passare.

/** Il saldo crediti dell'org, dalla RPC `org_credit_balance` (grant − debit, credit_ledger). */
export async function orgCreditBalance(supabase: SupabaseClient, orgId: string): Promise<number> {
  const { data, error } = await supabase.rpc('org_credit_balance', { _org_id: orgId });
  if (error) throw new Error(`org_credit_balance failed: ${error.message}`);
  return Number(data ?? 0);
}

// ── Usage query ──────────────────────────────────────────────────────────────────

const CREDITS_PER_USD = 100;

/**
 * Sum `cost_usd` from `ai_calls` in the current billing period for one scope (an org, or a
 * single brand when no org is in reach). PostgREST aggregates are off, so the sum runs in JS —
 * the row set is one billing period of one org's calls, not the whole table.
 */
async function sumAiCostUsd(
  supabase: SupabaseClient,
  scope: { orgId: string } | { brandId: string },
  start: Date,
  end: Date
): Promise<number> {
  let query = supabase
    .from('ai_calls')
    .select('cost_usd')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());
  query = 'orgId' in scope ? query.eq('org_id', scope.orgId) : query.eq('brand_id', scope.brandId);

  const { data, error } = await query;
  if (error) throw new Error(`ai_calls sum failed: ${error.message}`);

  return (data ?? []).reduce((sum: number, row: { cost_usd: number | null }) => sum + (row.cost_usd ?? 0), 0);
}

/**
 * Sum cost_usd × 100 from ai_calls in the current billing period for this brand.
 * Quota is always the free-tier quota: `orgs`/`brands` carry no plan column on the new schema,
 * so there is nothing to read a paid quota from — see the module doc. A read failure THROWS
 * (never returns `used: 0`): the caller's fail-open catch is the only place that decides to let
 * a spend through despite an unreadable ledger, and it reports every time it does.
 */
export async function getCreditsUsage(
  supabase: SupabaseClient,
  brand: Brand
): Promise<CreditsUsage> {
  const org = await resolveOrgBilling(supabase, brand.id);
  // No org in reach (a brand row that isn't there): answer for the brand alone.
  if (!org) return brandCreditsUsage(supabase, brand);

  return orgCreditsUsage(supabase, org, brand.activated_at);
}

/**
 * The pool as the org sees it. Split out of getCreditsUsage unchanged: a brand-free render has
 * no brand row to carry an anchor, and everything below the org already ignored the brand.
 */
export async function orgCreditsUsage(
  supabase: SupabaseClient,
  org: OrgBilling,
  activatedAtFallback: string | null = null
): Promise<CreditsUsage> {
  const { start, end } = currentBillingPeriod({ activated_at: org.activatedAt ?? activatedAtFallback });
  // creditQuota(null), not creditQuota(org.plan): org.plan is always null on the new schema (see
  // the OrgBilling doc above) — reading it here would let a caller-constructed OrgBilling with a
  // stale plan string buy a bigger quota than any org can actually prove it is entitled to.
  const quota = creditQuota(null);

  const spentUsd = await sumAiCostUsd(supabase, { orgId: org.orgId }, start, end);
  const used = Math.round(spentUsd * CREDITS_PER_USD);

  return {
    used,
    quota,
    bonus: 0,
    remaining: Math.max(0, quota - used),
    periodStart: start,
    periodEnd: end,
    percent: quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0
  };
}

/** The brand-only reading, kept whole for the case where no org can be resolved. */
async function brandCreditsUsage(
  supabase: SupabaseClient,
  brand: Brand
): Promise<CreditsUsage> {
  const { start, end } = currentBillingPeriod(brand);
  const quota = creditQuota(brand.plan);

  const spentUsd = await sumAiCostUsd(supabase, { brandId: brand.id }, start, end);
  const used = Math.round(spentUsd * CREDITS_PER_USD);

  return {
    used,
    quota,
    bonus: 0,
    remaining: Math.max(0, quota - used),
    periodStart: start,
    periodEnd: end,
    percent: quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0
  };
}

// `credit_grants` does not exist on the new schema (verified against database.types.ts) — the
// grant-summing that used to run here (sumActiveCreditGrants/sumGrantRows) has no table to read,
// so `bonus` above is hardcoded to 0 instead of a function that would always throw or always
// silently return 0. `grantCredits` below is left as dead code, not rewired: its only caller,
// referrals.ts, is itself built on tables that don't exist on the new schema (referral_codes,
// referrals) and is a deletion candidate per TYPES_AUDIT.md, not a repoint target.

// ── Enforcement ──────────────────────────────────────────────────────────────────

export class CreditsExhaustedError extends Error {
  public usage: CreditsUsage;
  constructor(usage: CreditsUsage) {
    super('AI credits exhausted for this billing period');
    this.name = 'CreditsExhaustedError';
    this.usage = usage;
  }
}

/**
 * Gate: throws CreditsExhaustedError if no credits remain.
 * Call before any AI chokepoint to enforce the quota.
 */
export function assertCreditsAvailable(usage: CreditsUsage): void {
  if (usage.remaining <= 0) {
    throw new CreditsExhaustedError(usage);
  }
}

// ── Self-contained hard gate ─────────────────────────────────────────────────────
// The runaway-spend circuit breaker (incident 2026-07-13: one crash-looping onboarding job
// burned ~$365 in 42h). Called at the top of every expensive flow AND inside renderImage —
// the costly chokepoint — so even a loop nobody anticipated stops at the quota.
// Fail-OPEN by design: a billing outage must never take the product down. The 60s per-brand
// cache bounds the DB overhead to ~3 queries per brand per minute.

import { createAdminClient } from './supabase-admin';

const gateCache = new Map<string, { usage: CreditsUsage; at: number }>();
const GATE_TTL_MS = 60_000;

/**
 * Insert a credit_grants row (quota boost). Service-role client required —
 * there is no authenticated insert policy on credit_grants.
 */
export async function grantCredits(
  supabase: SupabaseClient,
  opts: {
    brandId: string;
    amount: number;
    note?: string | null;
    createdBy?: string | null;
    expiresAt?: string | null;
  }
): Promise<void> {
  const amount = Math.floor(Number(opts.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('grantCredits: amount must be a positive integer');
  }
  const { error } = await supabase.from('credit_grants').insert({
    brand_id: opts.brandId,
    amount,
    note: opts.note ?? null,
    created_by: opts.createdBy ?? null,
    expires_at: opts.expiresAt ?? null
  });
  if (error) throw new Error(`grantCredits failed: ${error.message}`);
  // Invalidate the hard-gate cache so the gift is visible immediately. The gate keys on the org
  // now, so the entry to drop is the org's — the gift lands in the pool all its brands share.
  const org = await resolveOrgBilling(supabase, opts.brandId);
  gateCache.delete(org?.orgId ?? opts.brandId);
}

/**
 * The 29 call sites (17 direct + 12 via cli-auth.ts's gateAiAction) all call THIS function,
 * unchanged — it's the chokepoint. It delegates to the billing provider: the open provider's
 * gate() is a no-op, the dazero provider's gate() calls gateCreditsCore below (the real,
 * unrewritten enforcement). Dynamic import dodges a credits↔billing↔credits init-order cycle
 * (same trick already used below for ai-log).
 */
export async function gateCredits(brandId: string): Promise<void> {
  const { billingProvider } = await import('./billing');
  const provider = await billingProvider();
  await provider.gate('credits', { brandId });
}

/**
 * Lo stesso cancello per un lavoro senza brand: il pagante è l'organizzazione, e passa dallo stesso
 * provider — un fork self-hosted, che di fatturazione non ne ha, non deve trovarsi contato proprio
 * su questa strada perché è nuova.
 */
export async function gateOrgCredits(orgId: string): Promise<void> {
  const { billingProvider } = await import('./billing');
  const provider = await billingProvider();
  await provider.gate('credits', { orgId });
}

/**
 * Both fail-open paths below give up on the same thing — evaluating the ledger — and both let the
 * action through on purpose: a transient Supabase error must not block a paying customer. Neither
 * may do it silently. Unmetered AI nobody is told about is exactly how a week of it went unnoticed.
 */
function reportFailOpen(brandId: string, err: unknown): void {
  swallow(`credits: allowed brand ${brandId} without evaluating its ledger`, err);
}

/**
 * L'applicazione vera per chi il brand non ce l'ha. Stessa cassa e stessa chiave di `gateCredits`
 * — che risolve l'organizzazione e poi mette in cache SU DI ESSA — quindi una generazione senza
 * brand e una con lo stesso brand leggono la stessa riga invece di pagarsi due copie dello stesso
 * conto. Non per uso diretto: si chiama `gateOrgCredits`.
 */
export async function gateOrgCreditsCore(orgId: string): Promise<void> {
  const { isCreditExempt } = await import('./ai-log');
  if (isCreditExempt()) return;

  // Fuori dal try di proposito: un rifiuto qui è il cancello che fa il suo mestiere, e non deve
  // finire nel catch che lascia passare.
  const hit = gateCache.get(orgId);
  if (hit && Date.now() - hit.at < GATE_TTL_MS) {
    assertCreditsAvailable(hit.usage);
    return;
  }

  let usage: CreditsUsage;
  try {
    const admin = createAdminClient();
    usage = await ledgerCreditsUsage(admin, orgId);
    gateCache.set(orgId, { usage, at: Date.now() });
  } catch (e) {
    reportFailOpen(orgId, e);
    return;
  }
  assertCreditsAvailable(usage);
}

/**
 * Il saldo `credit_ledger` travestito da `CreditsUsage`, per il cancello e per la cache che già
 * esiste — non un secondo concetto di "quota", solo il saldo vero letto una volta. `quota`/`used`
 * qui sono display: quello che decide è `remaining`, ed è il saldo stesso.
 */
async function ledgerCreditsUsage(supabase: SupabaseClient, orgId: string): Promise<CreditsUsage> {
  const balance = await orgCreditBalance(supabase, orgId);
  const now = new Date();
  return {
    used: 0,
    quota: Math.max(0, balance),
    bonus: 0,
    remaining: Math.max(0, balance),
    periodStart: now,
    periodEnd: now,
    percent: 0
  };
}

/**
 * The real enforcement, moved out of gateCredits() unchanged so the dazero provider can call
 * it without gateCredits recursing back through itself. Not for direct use — call gateCredits().
 */
export async function gateCreditsCore(brandId: string): Promise<void> {
  // One-time system generation (onboarding pipeline) is exempt — it must always complete and has
  // its own runaway watchdog. Dynamic import dodges any credits↔ai-log init-order cycle.
  const { isCreditExempt } = await import('./ai-log');
  if (isCreditExempt()) return;

  // The pool is the org's, so the cache entry is too: every brand under an org reads and refreshes
  // the same one, instead of each paying for its own copy of the same numbers.
  let admin: SupabaseClient | null = null;
  let cacheKey = brandId;
  let orgId: string | null = null;
  try {
    admin = createAdminClient();
    const org = await resolveOrgBilling(admin, brandId);
    if (org) {
      cacheKey = org.orgId;
      orgId = org.orgId;
    }
  } catch (e) {
    reportFailOpen(brandId, e);
    return;
  }

  // Outside the try on purpose: a denial here is the gate doing its job, and must not be
  // swallowed by the fail-open catch below.
  const hit = gateCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GATE_TTL_MS) {
    assertCreditsAvailable(hit.usage);
    return;
  }

  let usage: CreditsUsage | null = null;
  try {
    if (orgId) {
      // Il saldo vero è dell'org, non del brand: due brand dello stesso org leggono lo stesso saldo.
      usage = await ledgerCreditsUsage(admin, orgId);
      gateCache.set(cacheKey, { usage, at: Date.now() });
    } else {
      const { data: brand, error } = await admin.from('brands').select('id').eq('id', brandId).maybeSingle();
      if (error) throw new Error(`brands lookup failed: ${error.message}`);
      if (!brand) return;
      // Un brand senza org risolvibile (dato inconsistente) non ha un saldo da leggere — fallback
      // alla quota free, per non lasciare la spesa senza alcun tetto.
      usage = await getCreditsUsage(admin, { id: brand.id, plan: null, activated_at: null, status: 'active' });
      gateCache.set(cacheKey, { usage, at: Date.now() });
    }
  } catch (e) {
    reportFailOpen(brandId, e);
    return;
  }
  assertCreditsAvailable(usage);
}

// ── Soft warning email (>80%) ──────────────────────────────────────────────────

const WARNING_THRESHOLD = 80;

import { env as publicEnv } from '$env/dynamic/public';
import { brandContacts } from './brand-contacts';
import { creditWarningEmailSubject, creditWarningEmailHtml, creditWarningEmailText } from './email';

/**
 * Segna `credits_warned_at` per questo periodo e dice se il claim è nostro. È l'unico lucchetto:
 * il vincolo unico (brand_id, month) fa perdere il secondo INSERT, e l'UPDATE tocca solo una riga
 * non ancora marcata in questo periodo. True = tocca a noi mandare la mail.
 */
async function claimCreditWarning(
  supabase: SupabaseClient,
  orgId: string,
  monthKey: string,
  start: Date
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error: insErr } = await supabase
    .from('org_usage')
    .insert({ org_id: orgId, month: monthKey, credits_warned_at: now });
  if (!insErr) return true; // la riga del mese non c'era: l'abbiamo creata noi
  const { data } = await supabase
    .from('org_usage')
    .update({ credits_warned_at: now })
    .eq('org_id', orgId)
    .eq('month', monthKey)
    .or(`credits_warned_at.is.null,credits_warned_at.lt.${start.toISOString()}`)
    .select('id');
  return !!data?.length;
}

/**
 * Send a one-time email warning when credit usage exceeds 80% of the quota.
 * Uses org_usage.credits_warned_at for anti-spam: one email per billing period, per org.
 * Fire-and-forget: never throws, never blocks the caller.
 */
export async function maybeSendCreditWarning(
  supabase: SupabaseClient,
  brand: { id: string; name: string; org_id?: string | null; plan?: string | null; slug?: string },
  usage: CreditsUsage
): Promise<void> {
  try {
    if (usage.percent < WARNING_THRESHOLD) return;

    // One pool, one warning: the anti-spam flag lives on the org, so an org with five brands
    // gets one email when the shared pool crosses the threshold, not five identical ones.
    const orgId = brand.org_id ?? (await resolveOrgBilling(supabase, brand.id))?.orgId;
    if (!orgId) return;

    // The billing window is already resolved inside `usage` — reuse it, don't recompute.
    const start = usage.periodStart;
    const monthKey = start.toISOString().slice(0, 10); // YYYY-MM-DD, aligned to org_usage.month

    // Anti-spam: already warned this period?
    const { data: u } = await supabase
      .from('org_usage')
      .select('credits_warned_at')
      .eq('org_id', orgId)
      .eq('month', monthKey)
      .maybeSingle();

    if (u?.credits_warned_at && new Date(u.credits_warned_at as string) >= start) return; // already sent

    // Resolve recipients
    const contacts = await brandContacts(supabase, orgId, brand.id);
    if (!contacts.length) return;

    // Si prenota PRIMA di spedire, e solo chi vince la corsa spedisce. La lettura qui sopra da sola
    // bastava finché a chiamare era l'autopilot, uno alla volta; ora chiama anche la rotta crediti,
    // che il layout interroga ogni 45s da ogni scheda aperta — due poll simultanei passavano
    // entrambi il controllo e mandavano due mail. Se poi l'invio fallisce si perde un avviso: è
    // esattamente il compromesso che questa funzione dichiara ("non critico"), al contrario dello spam.
    if (!(await claimCreditWarning(supabase, orgId, monthKey, start))) return;

    const appBase = (publicEnv.PUBLIC_APP_URL || '').replace(/\/$/, '');
    const { appPathForBrand } = await import('$lib/server/tenancy/brand-slug');
    const dashboardUrl = `${appBase}${await appPathForBrand(supabase, brand.id)}`;

    const { notifyBrandContacts } = await import('$lib/server/brand-notify');
    await notifyBrandContacts(supabase, contacts, {
      logPrefix: '[credits]',
      buildEmail: (locale, to) => ({
        to,
        subject: creditWarningEmailSubject(locale, brand.name, usage.percent),
        html: creditWarningEmailHtml(locale, {
          percent: usage.percent,
          used: usage.used,
          quota: usage.quota,
          resetDate: usage.periodEnd,
          brandName: brand.name,
          dashboardUrl
        }),
        text: creditWarningEmailText(locale, {
          percent: usage.percent,
          used: usage.used,
          quota: usage.quota,
          resetDate: usage.periodEnd,
          brandName: brand.name,
          dashboardUrl
        })
      }),
      push: dashboardUrl
        ? { url: dashboardUrl, tag: `credits-${brand.id}` }
        : undefined
    });
  } catch (e) {
    // Warning is non-critical — never break the caller
    console.warn('[credits] maybeSendCreditWarning failed:', e instanceof Error ? e.message : e);
  }
}
