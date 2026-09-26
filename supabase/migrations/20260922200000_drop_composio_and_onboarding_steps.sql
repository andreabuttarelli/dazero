-- COMPOSIO ESCE, E LE SUE SEI TABELLE RESTANO SUL DISCO MARCATE MORTE.
--
-- Composio brokerava le app esterne (Drive, Notion, GitHub, Gmail nel corpus di conoscenza del
-- brand; qualunque altro toolkit come tool agente) e il fan-out dei webhook verso l'endpoint di
-- ogni brand. Tutt'e due escono insieme: nessun codice raggiungibile scrive piu in queste
-- tabelle — i moduli che lo facevano (`composio.ts`, `composio-catalog.ts`, `composio-agent.ts`,
-- `brand-webhooks.ts`, `brand-triggers.ts`, `knowledge-sources.ts`) sono stati cancellati insieme
-- alle loro rotte e ai due cron (`/api/v1/webhooks/work`, `/api/v1/knowledge/sources/work`).
--
-- La vecchia onboarding a passi (ricerca del sito, setup guidato) esce con loro: e` gia` stata
-- sostituita dal bootstrap silenzioso su `/app`, e il suo unico worker (`/api/v1/onboarding/steps/work`)
-- era l'ultima cosa che la teneva in vita. `onboarding_step_jobs` e` la coda di quel worker.
--
-- PERCHE NON UN DROP. Qui i deploy non eseguono le migrazioni: una `drop table` in un file e una
-- tabella viva in produzione sono divergenza pura, e il prossimo `schema-drift-check` la legge
-- come uno schema indietro invece che come una scelta. `COMMENT ON TABLE` e metadato puro — non
-- rompe una query, una policy o una foreign key.
--
-- Il formato e quello di `20260921180000_deprecate_dead_tables.sql`, e non per simmetria: e la
-- forma che `obj_description` interroga con una sola `like`.
--
-- `src/lib/server/deprecated-tables.test.ts` tiene l'elenco: toglierne una e` togliere una riga
-- da li, quindi si vede nel diff invece di accadere in silenzio.

comment on table public.brand_app_connections is
  'DEPRECATED 2026-09-22: mirrorava le connessioni Composio del brand. Composio e uscito. Nessun sostituto.';

comment on table public.brand_knowledge_sources is
  'DEPRECATED 2026-09-22: le fonti Drive/Notion/GitHub del corpus di conoscenza, ingerite via Composio. Composio e uscito insieme alla feature knowledge. Nessun sostituto: la conoscenza del brand passa dai nodi in canvas.';

comment on table public.brand_triggers is
  'DEPRECATED 2026-09-22: i trigger Composio che alimentavano il fan-out dei webhook. Composio e uscito. Nessun sostituto.';

comment on table public.brand_webhooks is
  'DEPRECATED 2026-09-22: l endpoint del brand per il fan-out degli eventi Composio. Composio e uscito. Nessun sostituto.';

comment on table public.webhook_deliveries is
  'DEPRECATED 2026-09-22: la coda di consegna del fan-out verso brand_webhooks. Composio e uscito. Nessun sostituto.';

comment on table public.onboarding_step_jobs is
  'DEPRECATED 2026-09-22: la coda della vecchia onboarding a passi (ricerca del sito, setup guidato), sostituita dal bootstrap silenzioso su /app. Nessun sostituto: /app fa tutto in linea, senza coda.';
