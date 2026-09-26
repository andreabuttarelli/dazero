// Per-brand pricing tiers — the single source of truth for plan display + selection.
// Shared by the public /pricing page, onboarding and the activate paywall. The Stripe
// price ids that back these live server-side in $lib/server/stripe (PRICES); this module
// is display data only, so it's safe to import in the browser.

/**
 * Quante settimane dura un ciclo di piano editoriale.
 *
 * Sta qui e non in `editorial-plan.ts` perché la usano due livelli — il piano che le contiene e la
 * durata di un batch di pianificazione, che è gated dal piano tariffario — e `editorial-plan`
 * importa già `plans`: la costante di traverso avrebbe fatto un ciclo.
 */
export const PLAN_WEEKS = 4;

export type PlanKey = 'go' | 'starter' | 'pro';
export type Cycle = 'month' | 'year';
// Valuta di fatturazione. EUR di default; USD è la valuta parallela esplicita per chi sta fuori
// dall'eurozona, con prezzi Stripe in USD dedicati invece dell'Adaptive Pricing su un importo EUR.
export type Currency = 'eur' | 'usd';

// Stima marketing per "fino a ~N video HD" sulla card: 100 crediti = $1 di budget AI, e una clip
// HD a $0,38 costa 38 crediti. L'output reale varia con durata, risoluzione e altra spesa AI.
export const VIDEO_COST_USD_HD = 0.38;
/** Credits consumed by one typical HD clip (= $0.38 × 100). */
export const VIDEO_COST_CREDITS = VIDEO_COST_USD_HD * 100; // 38

/** Floor(plan credits ÷ cost-per-HD-video in credits). Uses the plan's real credit quota. */
export function videosFromCredits(credits: number): number {
  if (credits <= 0) return 0;
  return Math.floor(credits / VIDEO_COST_CREDITS);
}

/** Free-tier monthly credit grant (no Stripe plan). */
export const FREE_CREDITS = 400;

/*
 * NON reintrodurre `apiValueEur/Usd` (il "valore API" accanto ai crediti sul pricing): quei numeri
 * valevano quando Flash e Nano Banana Pro erano scontati. Dal 2026-08 ogni modello è fatturato al
 * 100% del listino, quindi 100 crediti valgono ESATTAMENTE $1 e i 2100 crediti del Go valgono $21,
 * non €50 — un dato vero che argomenta contro di noi sulla nostra stessa pagina prezzi. Nemmeno un
 * cambio di provider lo salva: solo il 54,8% della spesa passa da quei due modelli (misurato su
 * ai_calls, 30 giorni), quindi il tetto sarebbe $2,21 per 100 crediti.
 */

export type Plan = {
  key: PlanKey;
  name: string;
  m: number; // €/mo billed monthly
  a: number; // effective €/mo when billed annually (12× upfront)
  mUsd: number; // $/mo billed monthly
  aUsd: number; // effective $/mo when billed annually
  /**
   * Crediti di produzione inclusi ogni mese (100 crediti = $1 di `cost_usd`).
   *
   * NON è un numero scelto a mano: è prezzo × (1 − margine), con i margini dichiarati in
   * `plan-budget.ts` — 50%, 40% su Go. Prima erano tre cifre con margini impliciti diversi (28% /
   * 38% / 47%) che nessuno aveva deciso, e un cambio di listino li lasciava indietro in silenzio.
   * Un test li tiene allineati: la pagina prezzi e l'entitlement leggono questo stesso campo.
   */
  credits: number;
  /**
   * English fallback tagline. UI copy is localized via `pricing.plans.{key}.tagline`
   * (PlanCards, chat upgrade) — keep in sync with `en.json`.
   */
  tagline: string;
  popular: boolean;
  /**
   * English fallback bullets (keep ≤6). UI copy is localized via
   * `pricing.plans.{key}.highlights` (pipe-separated) — keep in sync with `en.json`.
   */
  highlights: string[];
  /** Social channels offered — keys of PLATFORM_META. */
  platforms: string[];
  /**
   * How many of `platforms` the tier includes. DISPLAY ONLY — connect caps live in
   * `$lib/server/plans` ACCOUNT_LIMITS. Go is 0 (prepare & export, no Zernio).
   */
  socialsIncluded: number;
  /** AI assistants / search engines the brand is measured in — keys of AI_SURFACE_META. */
  aiSurfaces: string[];
  /** Monthly social-post quota (display) — must match `POST_QUOTAS` in `$lib/server/plans`. */
  postsPerMonth: number;
  /** Monthly blog-article hard ceiling — must match `BLOG_ARTICLES_PER_MONTH`. */
  articlesPerMonth: number;
};

export const PLANS: Plan[] = [
  {
    key: 'go',
    name: 'Go',
    m: 25,
    a: 21,
    mUsd: 29,
    aUsd: 24,
    credits: 1740,
    tagline: 'You publish. We prepare.',
    popular: false,
    highlights: [
      'Strategy & editorial plan for your brand',
      'Posts ready to export — you publish',
      'SEO, GEO & blog hosting',
      'Leads on Reddit, Google & Bing',
      'Email support'
    ],
    platforms: ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'threads', 'youtube', 'bluesky', 'reddit'],
    socialsIncluded: 0,
    aiSurfaces: ['chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'grok', 'deepseek', 'google', 'bing'],
    postsPerMonth: 15,
    articlesPerMonth: 15
  },
  {
    key: 'starter',
    name: 'Starter',
    m: 79,
    a: 66,
    mUsd: 89,
    aUsd: 74,
    credits: 4450,
    tagline: 'For one brand getting consistent.',
    popular: true,
    highlights: [
      'Autopublish to 2 social accounts',
      'Editorial plan on autopilot',
      'Blog articles built to rank',
      'Backlink network across feega brands',
      'Meta & Google Ads — you approve spend'
    ],
    platforms: ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'threads', 'youtube', 'bluesky', 'reddit'],
    socialsIncluded: 2,
    aiSurfaces: ['chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'grok', 'deepseek', 'google', 'bing'],
    postsPerMonth: 30,
    articlesPerMonth: 30
  },
  {
    key: 'pro',
    name: 'Pro',
    m: 199,
    a: 166,
    mUsd: 225,
    aUsd: 188,
    credits: 11250,
    tagline: 'The full autonomous manager.',
    popular: false,
    highlights: [
      'Autopublish to 8 social accounts',
      'Higher capacity across posts, blog & leads',
      'Backlink network across feega brands',
      'Up to 4K images / videos',
      'Leads on X, Threads & LinkedIn too (~30–60/day)',
      'Priority human support'
    ],
    platforms: ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'threads', 'youtube', 'bluesky', 'reddit'],
    socialsIncluded: 8,
    aiSurfaces: ['chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'grok', 'deepseek', 'google', 'bing'],
    postsPerMonth: 90,
    articlesPerMonth: 90
  }
];

export function isPlanKey(x: string | null | undefined): x is PlanKey {
  return x === 'go' || x === 'starter' || x === 'pro';
}

/** Plans shown on pricing / activate. Go is gated by the Vercel `FEATURE_PLAN_GO` flag. */
export function visiblePlans(includeGo: boolean): Plan[] {
  return includeGo ? PLANS : PLANS.filter((p) => p.key !== 'go');
}

// Default to annual — the better-value cycle and what the paywall pre-selects.
export function normalizeCycle(x: string | null | undefined): Cycle {
  return x === 'month' ? 'month' : 'year';
}

// Pro is the default highlight when no (valid) plan is named.
export function planByKey(key: string | null | undefined): Plan {
  return PLANS.find((p) => p.key === key) ?? PLANS.find((p) => p.key === 'pro')!;
}
// I prezzi sopra sono in EUR. Con Stripe Adaptive Pricing, chi è FUORI dall'eurozona vede e paga
// nella propria valuta al checkout: questo flag (paese dall'edge Vercel) permette alla UI di dirlo.
// Paese sconosciuto (dev / header assente) → false.
const EUROZONE = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'
]);

export function showsLocalCurrency(country: string | null | undefined): boolean {
  return !!country && !EUROZONE.has(country);
}

// Which billing currency a visitor gets. Non-eurozone → USD (dedicated parallel USD Stripe
// prices); eurozone + unknown (dev/no header) → EUR.
export function currencyForCountry(country: string | null | undefined): Currency {
  return showsLocalCurrency(country) ? 'usd' : 'eur';
}

export const CURRENCY_SYMBOL: Record<Currency, string> = { eur: '€', usd: '$' };

// Pick the monthly/annual display amount for a plan in the given currency.
export function monthlyPrice(plan: Plan, currency: Currency): number {
  return currency === 'usd' ? plan.mUsd : plan.m;
}
export function annualPrice(plan: Plan, currency: Currency): number {
  return currency === 'usd' ? plan.aUsd : plan.a;
}

// A brand is "paid" once it's on a real subscription tier; empty/absent plan = free trial.
// Shared by server gates and client UI (e.g. Connect → /activate for free brands).
// `scale` is a legacy/grandfathered paid tier (still active for a few brands).
// `go` is paid but has no Zernio / autopublish (prepare & export only).
export const PAID_PLAN_IDS = ['go', 'starter', 'pro', 'scale'] as const;

export function isPaidPlan(plan: string | null | undefined): boolean {
  return (PAID_PLAN_IDS as readonly string[]).includes(String(plan));
}

/**
 * Chat context ceiling for the tiers that don't get the model's full window (free + Go).
 * 256k tokens ≈ a very long working session; past it the thread auto-compacts as usual.
 */
export const CHAT_CONTEXT_CAP_TOKENS = 256_000;

/**
 * Finestra piena del modello in chat — Starter/Pro/scale. Free e Go restano a
 * CHAT_CONTEXT_CAP_TOKENS. La compattazione avviene su ogni piano: questo sposta la soglia, non
 * butta cronologia che l'utente può scorrere.
 */
export function hasFullChatContext(plan: string | null | undefined): boolean {
  return plan === 'starter' || plan === 'pro' || plan === 'scale';
}

/** Autopublish + Zernio social connects — Starter/Pro/scale only. Go is export-only. */
export function hasSocialPublishing(plan: string | null | undefined): boolean {
  return plan === 'starter' || plan === 'pro' || plan === 'scale';
}

// Free / trial / canceled / paused brands must not connect (or keep) Zernio socials.
// Go is paid but deliberately has zero connected accounts (no Zernio spend).
export function canConnectSocials(
  plan: string | null | undefined,
  status: string | null | undefined
): boolean {
  return status === 'active' && hasSocialPublishing(plan);
}

/** 4K Motion video MP4 encode — Pro (and legacy scale) only. */
export function hasMotionVideo4k(plan: string | null | undefined): boolean {
  return plan === 'pro' || plan === 'scale';
}

/** True when the plan may create/boost ads via Zernio (Starter and up; legacy Scale included). */
export function hasAds(plan: string | null | undefined): boolean {
  return plan === 'starter' || plan === 'pro' || plan === 'scale';
}

