# L'autopilot non esiste più

Il prodotto diventa una tela infinita: l'utente e l'agente agiscono quando decidono loro. Il
ciclo settimanale autonomo — pianifica, produce, fa approvare, programma — era l'opposto, e se
ne va intero.

## Cosa è stato tolto

- `scheduler.ts` (1512 righe) e il suo test: `runAutopilotForBrand`, cioè il giro completo su un
  brand. Con lui `director.ts`, che rivedeva il batch prima del salvataggio e non aveva altri
  chiamanti.
- Le rotte `/api/v1/autopilot/tick` e `/api/v1/autopilot/digest/tick`, i due cron in
  `vercel.json`, e `supabase/sql/autopilot_cron.sql` che li documentava.
- La pagina `automations`, l'endpoint `settings/automations` e il tool `set_automation`: il tool
  puntava a una rotta che non c'è più. È ora in `RETIRED` dentro `retired-tools.test.ts`, dove un
  ritorno indietro accidentale fallisce.
- `autopilot-thresholds.ts`, `publish-digest.ts` (il suo unico consumatore era il digest tick),
  `reconciliation.ts` (orfano nello stesso istante del tick), `/api/v1/brands/:slug/tick` che
  inoltrava al tick cancellato, e il job `autopilot` dal roster.

## Cosa è rimasto, e perché

**Zernio e `publish.ts`.** Il trasporto non era dell'autopilot: `publishApprovedPost` ha quindici
chiamanti on-demand — il link firmato dell'email di approvazione, `/approvals`, il calendario, la
CLI, il tool MCP `publish_post`. Lo scheduler non lo importava nemmeno, e un test lo teneva
(`publishing-settings.test.ts`). Di `publish.ts` sono uscite solo le quattro esportazioni che
passavano esclusivamente da `reconciliation.ts` — `checkScheduleDivergence`, `reschedulePost`,
`DivergentPost` — mentre `stampVisualMetaPublished` ha smesso di essere esportata perché la usa
`syncDuePosts` lì dentro.

**`prepublish-check.ts` resta.** Ha un cron suo (`*/5`) e tre chiamanti fuori dall'autopilot: è
il cancello dell'ultimo metro, non un pezzo del ciclo.

**Due funzioni sono state estratte invece che cancellate.** `brandContacts` /
`brandOwnerContact` vivevano dentro `scheduler.ts` ma le leggevano blog, crediti, onboarding,
lifecycle e recap: sono in `brand-contacts.ts`. `rankRecentWinners` è una classifica pura che
usano il piano, il GTM e il setup: è in `recent-winners.ts`. Tenerle nello scheduler avrebbe
significato non poterlo cancellare; copiarle avrebbe significato due classifiche che divergono.

**Il piano editoriale resta.** `editorial-plan.ts` ha ~48 chiamanti, fra cui `cli/`,
`packages/api-contracts/` e le rotte `/editorial-plan/*`: proporre, rivedere e approvare un piano
è un'azione che l'utente fa, non un cron. Stessa ragione per `produce-agent.ts` e
`week-planner-agent.ts`, che hanno un consumatore vivo in `/start/preview`, e per
`strategy-agent.ts`, che esporta l'infrastruttura condivisa (`agentModel`, `withAgentFallback`,
`deadlineReached`) su cui poggiano `analytics-review-agent` e `brand-agent/limits`.

## La migration

`20260921210000_drop_autopilot.sql` toglie le tre colonne di `brands` e la riga `autopilot` da
`brand_job_optouts`. **Non** tocca `scheduler_runs`: la leggono ancora il recap del lunedì e il
dettaglio brand della CLI. Cancellarla avrebbe rotto due superfici vive per guadagnare una
tabella vuota — va via quando quei due smettono di chiederla.
