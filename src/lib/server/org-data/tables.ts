/**
 * LE 26 TABELLE DEL NUOVO SCHEMA, quelle che `orgs_members` porta sotto `org_isolation`.
 *
 * Non generato da `supabase/migrations/`: quella cartella è ancora lo schema vecchio (brand →
 * organizations → brand_members), mentre questo database (klnswzhhgrqvbfjzioul) è già il nuovo —
 * org → project/brand → canvas. `packages/api-contracts/src/query-tables.ts` resta quello che è,
 * perché lo legge `brand-data/query-tool.ts` ed è confrontato riga per riga con le migration in
 * `query-tool.test.ts`: toccarlo per il DB nuovo romperebbe la lettura sul DB vecchio, che i tool
 * di brand usano ancora oggi.
 *
 * La lista qui sotto è quella di `src/lib/database.types.ts` — generato dal database vero — e
 * `org-tables.test.ts` la confronta con quel file, così una tabella nuova o rinominata fa fallire
 * il test invece di lasciare l'agente cieco.
 */
export const ORG_TABLES = [
  'ad_accounts',
  'ad_campaigns',
  'ad_creatives',
  'ai_calls',
  'api_keys',
  'assets',
  'brands',
  'canvas_events',
  'canvases',
  'chat_messages',
  'chat_threads',
  'competitor_ads',
  'node_runs',
  'nodes',
  'nodes_connections',
  'orgs',
  'orgs_invites',
  'orgs_members',
  'post_sources',
  'posts',
  'products',
  'profiles',
  'projects',
  'scheduled_posts',
  'social_accounts',
  'social_posts'
] as const;

export type OrgTable = (typeof ORG_TABLES)[number];

/** Le due tabelle su cui un agente MCP deve annunciarsi prima di scrivere — vedi §8bis. */
export const CANVAS_WRITE_TABLES = new Set<string>(['nodes', 'nodes_connections']);
