/**
 * IL REGISTRO DI CHI SCAVALCA LA RLS.
 *
 * `service_role` ha `bypassrls`: un client costruito con quella chiave legge e scrive ogni org di
 * ogni cliente. La RLS è la difesa, e questo file elenca i punti in cui è spenta — uno per riga,
 * con il motivo accanto, perché un'eccezione dichiarata in cinque posti diversi diverge alla prima
 * modifica e diverge in silenzio.
 *
 * Una voce nuova è una riga qui. Un percorso che non è qui non ottiene il client: `createServiceRoleDb`
 * esige la voce, quindi il default è la chiave anon e la RLS accesa.
 *
 * ⚠️ Nessuna voce vale per una richiesta che porta un `org_id` scelto da chi chiama. Il criterio
 * è uno: la service role serve quando NON c'è un utente a cui chiedere i permessi — un cron, un
 * webhook, la ricerca di una chiave API prima di sapere chi è. Se un utente c'è, il suo JWT basta.
 */
export type ServiceRoleUse = {
  /** Dove vive il codice che lo usa. */
  path: string;
  /** Perché non può esistere un JWT utente su quel percorso. */
  why: string;
  /** Le tabelle che tocca: il perimetro da riguardare quando il registro cresce. */
  tables: readonly string[];
};

export const SERVICE_ROLE_USES: readonly ServiceRoleUse[] = [
  {
    path: 'src/lib/server/cli-auth.ts — authenticateApiKey',
    why: "La chiave API va risolta in un utente PRIMA di sapere chi è: non esiste ancora un JWT su cui far girare la RLS. La lettura è su key_hash e non accetta nulla da chi chiama oltre la chiave stessa; dopo la risoluzione il lavoro continua con il client dell'utente.",
    tables: ['api_keys']
  },
  {
    path: 'src/routes/api/v1/canvas/runs/tick/+server.ts — expireStuckRuns + reconcileVideoNodeRuns + drainLoopQueue + pruneOldCanvasEvents + renewAccountSeats',
    why: "Un cron non ha una sessione: nessun utente ha cliccato. Prende le righe già scadute o in coda (run rimasti in corso, video da riconciliare, biglietti di loop da drenare, eventi canvas_events più vecchi di 356 giorni) attraverso tutte le org per costruzione, e l'org_id lo LEGGE dalla riga che ha preso — non lo riceve mai da fuori. `drainLoopQueue` gira `runGenNode` per un biglietto reclamato, con la stessa identità di servizio con cui il video già deposita il suo asset — `assets`/`ai_calls` sono scritture di quella funzione, non di questa rotta. La potatura di canvas_events è l'unica eccezione dichiarata: pota per età, su ogni org insieme, non per riga scoperta da un org_id letto — vedi retention.ts. `renewAccountSeats` (account-billing.ts) scorre ogni social_accounts attivo attraverso tutte le org per lo stesso motivo — un rinnovo mensile non ha un utente che lo clicca — e scrive solo credit_ledger/social_accounts della riga che sta processando.",
    tables: ['node_runs', 'nodes', 'canvas_events', 'assets', 'ai_calls', 'social_accounts', 'credit_ledger']
  },
  {
    path: 'le callback dei provider, src/routes/api/v1/webhooks/** (non ancora scritte: fase 3 e 5)',
    why: 'Zernio e i provider di generazione chiamano senza una sessione utente. La riga da aggiornare si trova dal loro id esterno, che è già legato a una org; la firma della richiesta è ciò che autentica, non un JWT. Programmazione e stato di pubblicazione si leggono da Zernio, non da una tabella nostra (scheduled_posts è stata rimossa, 2026-09-22): un eventuale webhook scriverebbe solo posts.zernio_post_ids.',
    tables: ['posts', 'node_runs', 'ai_calls']
  },
  {
    path: 'src/lib/server/tenancy/bootstrap.ts — createFirstOrg',
    why: "Alla creazione non esiste ancora una riga in orgs_members, quindi auth_org_ids() è vuoto e la policy rifiuterebbe l'insert della org e del suo primo membro. È l'unico punto in cui la RLS non può funzionare per costruzione: l'appartenenza sta nascendo. Non accetta un org_id da chi chiama — lo crea, e il membro è sempre l'utente della sessione. Legge/scrive anche credit_ledger (assertFreeOrgLimit, grantWelcomeCredits): il limite di org gratuite e il benvenuto sono decisi qui, non altrove.",
    tables: ['orgs', 'orgs_members', 'credit_ledger']
  },
  {
    path: 'src/lib/server/tenancy/bootstrap.ts — acceptInvite',
    why: "Chi accetta non è ancora membro di quell'org: auth_org_ids() non la contiene, e la policy org_isolation su orgs_invites nasconderebbe l'invito proprio a chi lo sta usando. L'org_id non arriva da fuori, si LEGGE dalla riga trovata per impronta del token; il token in chiaro non è mai salvato e scaduto, inesistente o già speso rispondono tutti allo stesso modo. Legge anche credit_ledger (assertFreeOrgLimit): lo stesso limite di org gratuite di createFirstOrg si applica anche a un invito accettato.",
    tables: ['orgs_invites', 'orgs_members', 'credit_ledger']
  },
  {
    path: 'src/lib/server/org-data/auth.ts — resolveApiKey (MCP e CLI su /api/v1/org/**)',
    why: "Una chiave API `dazero_…` va risolta in un utente e un'org PRIMA di sapere chi è: non esiste un JWT su cui far girare auth_org_ids(). Dopo la risoluzione l'org_id NON arriva più da chi chiama: è quello della riga trovata per key_hash, imposto su ogni lettura e scrittura successiva da org-data/query-tool.ts e write-tool.ts — mai un filtro facoltativo.",
    tables: ['api_keys']
  },
  {
    path: 'scripts/import-anomalia-talents.ts',
    why: "Uno script una tantum, senza sessione utente: scrive il catalogo globale (`influencers.org_id = null`), che la RLS vieta a qualunque JWT per costruzione — le policy di scrittura richiedono `org_id is not null`. Legge anche dal progetto Supabase VECCHIO (`OLD_DAZERO_*`), un database diverso su cui questa distinzione non si applica.",
    tables: ['influencers', 'influencer_views']
  }
] as const;
