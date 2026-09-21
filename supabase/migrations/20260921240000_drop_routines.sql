-- IL MOTORE DELLE ROUTINE NON ESISTE PIÙ: via gli obiettivi di un turno, la lettura dei thread,
-- gli agenti custom e le loro schedulazioni, e i run del kit che li eseguiva.
--
-- Era il prodotto vecchio: un agente headless che girava da solo su una schedulazione, si dava un
-- obiettivo, delegava a dei sotto-agenti e riportava in un thread. Non aveva UI — la pagina
-- `/agents` che lo configurava è stata tolta insieme al motore — e la chat di brand che resta
-- (`brand-agent/`) non passa di qui: ha il suo `surface` su `chat_threads` e un MCP remoto.
--
-- PERCHÉ UN DROP E NON UN COMMENT. La regola di 20260921180000 — marcare invece di cancellare —
-- vale per una tabella il cui scrittore ha perso i chiamanti ma potrebbe riaverli. Qui la
-- funzionalità è stata rimossa, non sospesa: non c'è più un lettore, un writer o una rotta.
--
-- COSA NON SI TOCCA, e sono quattro, tutte ancora scritte da codice vivo:
--   `chat_threads` / `chat_messages` — la chat di brand ci vive sopra, filtrata per `surface`;
--   `chat_jobs`                      — è la coda del Designer (motion, UGC, ads remix), non della chat;
--   `chat_artifacts`                 — `designer/artifacts.ts` ci deposita ancora i file di un turno;
--   `agent_runs` / `agent_sessions`  — li scrivono SEO, analytics review e l'harness.
--
-- L'ORDINE CONTA: `custom_agent_schedules` e `custom_agent_thread_runs` hanno una FK su
-- `custom_agents`, quindi le figlie vanno prima della madre.
--
-- I deploy NON eseguono le migration: applicare a mano.

drop table if exists public.chat_goal_events;
drop table if exists public.chat_goals;
drop table if exists public.chat_thread_reads;

drop table if exists public.custom_agent_thread_runs;
drop table if exists public.custom_agent_schedules;
drop table if exists public.custom_agents;

drop table if exists public.agent_kit_effects;
drop table if exists public.agent_kit_approval_requests;
drop table if exists public.agent_kit_runs;

drop table if exists public.agent_notifications;
