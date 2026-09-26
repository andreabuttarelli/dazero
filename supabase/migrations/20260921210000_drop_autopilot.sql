-- L'AUTOPILOT NON ESISTE PIÙ: via le colonne con cui il ciclo settimanale si teneva il posto.
--
-- Il prodotto diventa una tela infinita: l'utente e l'agente agiscono quando decidono loro, non
-- quando scatta un cron. Pianificare la settimana, produrla, farla approvare e programmarla da
-- solo era l'autopilot, ed è stato tolto dal codice — `scheduler.ts`, `director.ts`, le rotte
-- `/api/v1/autopilot/*`, la pagina `automations` e i due cron di `vercel.json`. Queste righe sono
-- lo stato che quel codice si scriveva addosso fra un giro e l'altro.
--
-- PERCHÉ UN DROP E NON UN COMMENT. La regola di 20260921180000 — marcare invece di cancellare —
-- vale per una tabella il cui scrittore ha perso i chiamanti ma potrebbe riaverli. Qui non c'è
-- più né lo scrittore né il lettore: `autopilot_enabled` era già ritirato in favore del roster,
-- e il contatore dei fallimenti lo incrementava solo il tick che non esiste più.
--
-- COSA NON SI TOCCA, ED È LA PARTE CHE CONTA:
--   · `scheduler_runs` RESTA. La leggono ancora il recap del lunedì (`weekly-recap.ts`) e il
--     dettaglio brand della CLI (`cli-queries.ts`): senza autopilot non arrivano righe nuove, ma
--     lo storico è loro e cancellarlo romperebbe due superfici vive. Va via quando quei due
--     smettono di chiederlo.
--   · `posts.scheduler_run_id` RESTA: è la chiave esterna verso quello storico.
--   · `brand_job_optouts`, `loop_ticks`, `loop_cursors` RESTANO: sono condivise con gli altri
--     lavori del roster (analytics review, recap, strategy review, library). Sparisce solo la
--     riga con chiave 'autopilot', non l'impianto.
--   · La pubblicazione RESTA INTERA. Zernio, `publish.ts` e l'approvazione on-demand non
--     dipendevano dal cron: pubblicare un post a comando continua a funzionare identico.
--
-- I deploy NON eseguono le migration: applicare a mano.

alter table public.brands drop column if exists autopilot_enabled;
alter table public.brands drop column if exists autopilot_failure_count;
alter table public.brands drop column if exists last_autopilot_run_at;

delete from public.brand_job_optouts where job_key = 'autopilot';
