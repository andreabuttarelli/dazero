/**
 * I lavori ricorrenti inclusi nel prodotto. L'elenco vero e' `ROSTER_JOBS`
 * (`$lib/server/job-roster`), che il contratto non puo' importare: un test dell'app tiene i due
 * allineati. Il testo di cosa fa ciascuno NON e' qui — arriva dalla rotta, da `jobBlurb`, che e'
 * la stessa fonte del prompt di onboarding.
 */
export const AUTOMATION_JOBS = [
  'analytics_review',
  'weekly_recap',
  'market_refs',
  'strategy_review',
  'library'
] as const;

export type AutomationJob = (typeof AUTOMATION_JOBS)[number];

export const AUTOMATION_CADENCES = ['daily', 'weekly', 'monthly'] as const;
export const AUTOMATION_STATES = ['off', 'ok', 'skipped', 'failed', 'never'] as const;
