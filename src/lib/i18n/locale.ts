// Pure-TS locale helpers — NO svelte-i18n import, so this is safe to pull into
// app.d.ts without dragging the client i18n store server-side.

export const SUPPORTED = ['en'] as const;
export type Locale = (typeof SUPPORTED)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (SUPPORTED as readonly string[]).includes(v);
}

// English name of the language an AI writes its user-facing prose in. The app UI ships English
// only; a brand's own publishing language is a separate, product-level choice ($lib/blog-locales).
export const OUTPUT_LANGUAGE = 'English';

/**
 * Notices, job reports and rate-limit copy that only ship English/Italian.
 * Anything that is not Italian — empty, `en-IN`, Hindi-only, Spanish, `*` — is English.
 * Never the other way around: missing `en` in Accept-Language used to collapse to Italian.
 *
 * Takes `unknown` on purpose: queued jobs persist params as jsonb, so `params.locale`
 * reaches us untyped, and coercing at every call site re-invites the exact bug this
 * branch fixed (amazon.in, 27/8/2026).
 */
export function bilingualNoticeLocale(locale: unknown): 'en' | 'it' {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('it') ? 'it' : 'en';
}
