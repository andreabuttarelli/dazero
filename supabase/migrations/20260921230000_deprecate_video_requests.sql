-- LE COMMISSIONI VIDEO AI FOUNDER NON ESISTONO PIÙ: la tabella resta, marcata.
--
-- Era un servizio a mano dentro un prodotto software: l'utente compilava un brief, un founder
-- girava e montava la clip e la consegnava nel brand come post da approvare. La tela infinita non
-- ha un posto dove metterlo. È uscito tutto il codice che la toccava — la dashboard di
-- fulfilment `/admin/videos`, l'endpoint `/content/request-video`, `video-requests.ts`,
-- `founderVideoQuota` e il tipo 'team' del modale di creazione: la tabella non ha più né un
-- lettore né uno scrittore.
--
-- PERCHÉ UN COMMENT E NON UN DROP, al contrario di waitlist e autopilot. Lì lo stato era una
-- scrittura che il codice si faceva addosso fra un giro e l'altro, e buttarlo non perde nulla.
-- Qui le righe sono RICHIESTE DI CLIENTI PAGANTI e le clip che ne sono uscite: quante ne hanno
-- chieste, cosa hanno chiesto, quali sono state rifiutate. È storico commerciale, e un
-- `drop table` lo brucia senza che nessuno possa più rispondere a «quanti l'hanno usato».
-- `reference_urls` punta inoltre a file nel bucket `media` che la cascata non tocca: togliere la
-- tabella lascia gli oggetti orfani senza nemmeno l'elenco per ritrovarli.
--
-- `video_requests.delivered_post_id` è una FK verso `posts` con `on delete set null`: i post
-- consegnati restano post normali del brand, e continuano a vivere senza sapere da dove vengono.
--
-- `public.admins` e `public.is_admin()` NON si toccano qui, e la ragione va detta: le policy di
-- questa tabella non li usano (il fulfilment passava dal service-role, che salta la RLS), quindi
-- non sono suoi. Erano di `/admin`, che è uscito, e dell'ultimo chiamante SQL — `can_enter()` in
-- 0009 — che 20260921220000 ha già droppato. Restano senza chiamanti: chi li ritira lo faccia in
-- una migrazione sua, dove la prova sta insieme alla decisione.
--
-- I deploy NON eseguono le migration: applicare a mano.

comment on table public.video_requests is
  'DEPRECATED 2026-09-21: le commissioni video ai founder sono uscite dal prodotto, nessun codice la legge o la scrive. Nessun sostituto: i video si generano con l AI.';
