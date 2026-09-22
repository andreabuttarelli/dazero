// La mappa "chi possiede cosa" fra gli agenti della squadra e le routine del roster, in UN posto
// solo e client-safe (job-roster.ts tira dentro supabase-admin e non può entrare in un
// componente).
//
// Le chiavi sono quelle di ROSTER_JOBS: agent-owners.test.ts fallisce se le due liste divergono,
// così questa copia client non può invecchiare in silenzio.

/** Chiave di un lavoro del roster (speculare a JobKey in job-roster.ts, ma client-safe). */
export type OwnerJobKey =
  | 'analytics_review'
  | 'weekly_recap'
  | 'market_refs'
  | 'strategy_review'
  | 'library';

/** Gli agenti della squadra di default — gli stessi id del composer ($lib/server/chat/agents.ts + 'auto'). */
export type TeamAgentId = 'auto' | 'content' | 'ugc' | 'motion' | 'web' | 'analyst';

/**
 * Ogni valore che `agent` può portare come PROPRIETARIO di una routine, dazero inclusa.
 */
export const TEAM_AGENT_IDS: readonly TeamAgentId[] = ['content', 'analyst', 'web', 'ugc', 'motion', 'auto'];

/**
 * I lavori del roster non sono agenti: sono le routine dei sei agenti veri della chat. Il roster
 * (job-roster.ts) verifica a compile-time che ogni JobKey abbia un owner qui.
 */
export const JOB_OWNERS: Record<OwnerJobKey, TeamAgentId> = {
  analytics_review: 'analyst',
  weekly_recap: 'analyst',
  market_refs: 'analyst',
  strategy_review: 'analyst',
  library: 'web'
};
