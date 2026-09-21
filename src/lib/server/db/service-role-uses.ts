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
    path: 'i worker a tempo, src/routes/api/v1/cron/** (non ancora scritti: fase 3 e 5)',
    why: "Un cron non ha una sessione: nessun utente ha cliccato. Prende le righe già scadute (run in corso, consegne da pubblicare) attraverso tutte le org per costruzione, e l'org_id lo LEGGE dalla riga che ha preso — non lo riceve mai da fuori.",
    tables: ['node_runs', 'scheduled_posts', 'nodes']
  },
  {
    path: 'le callback dei provider, src/routes/api/v1/webhooks/** (non ancora scritte: fase 3 e 5)',
    why: 'Zernio e i provider di generazione chiamano senza una sessione utente. La riga da aggiornare si trova dal loro id esterno, che è già legato a una org; la firma della richiesta è ciò che autentica, non un JWT.',
    tables: ['scheduled_posts', 'node_runs', 'ai_calls']
  },
  {
    path: 'la prima org di un utente nuovo (non ancora scritta: fase 2)',
    why: "Alla creazione non esiste ancora una riga in orgs_members, quindi auth_org_ids() è vuoto e la policy rifiuterebbe l'insert della org e del suo primo membro. È l'unico punto in cui la RLS non può funzionare per costruzione: l'appartenenza sta nascendo.",
    tables: ['orgs', 'orgs_members', 'profiles']
  }
] as const;
