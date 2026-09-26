-- IL MARKET HARVEST ESCE, E LE SUE NOVE TABELLE RESTANO SUL DISCO MARCATE MORTE.
--
-- La verticale raccoglieva post di concorrenti e trend da Instagram, TikTok, Threads, LinkedIn e
-- Reddit, li smontava con un modello e ne distillava un playbook. Appartiene al prodotto vecchio:
-- lo strumento a canvas infinito non parte da cosa fanno gli altri, quindi nessun codice
-- raggiungibile scrive piu in queste tabelle — i moduli che lo facevano sono stati cancellati
-- insieme alle loro rotte e al cron giornaliero del field watch.
--
-- PERCHE NON UN DROP. Qui i deploy non eseguono le migrazioni: una `drop table` in un file e una
-- tabella viva in produzione sono divergenza pura, e il prossimo `schema-drift-check` la legge
-- come uno schema indietro invece che come una scelta. `COMMENT ON TABLE` e metadato puro — non
-- rompe una query, una policy o una foreign key — e sopravvive al fatto che il drop vero si fara
-- a mano, una volta sola, quando le righe non serviranno piu a nessuno.
--
-- Il formato e quello di `20260921180000_deprecate_dead_tables.sql`, e non per simmetria: e la
-- forma che `obj_description` interroga con una sola `like`.

comment on table public.market_posts is
  'DEPRECATED 2026-09-21: il market harvest e uscito col prodotto vecchio. Nessun sostituto: i post social che il prodotto guarda ora sono quelli del brand, in social_post_history.';

comment on table public.market_teardowns is
  'DEPRECATED 2026-09-21: smontava i post del market harvest, che e uscito. Nessun sostituto.';

comment on table public.market_post_observations is
  'DEPRECATED 2026-09-21: misurava nel tempo i post del market harvest, che e uscito. Nessun sostituto.';

comment on table public.market_account_baselines is
  'DEPRECATED 2026-09-21: la normale di un account serviva a dire quanto un post del market harvest la battesse. La verticale e uscita. Nessun sostituto.';

comment on table public.market_account_fetch_attempts is
  'DEPRECATED 2026-09-21: la coda dei fetch del market harvest, che e uscito. Nessun sostituto.';

comment on table public.market_video_analyses is
  'DEPRECATED 2026-09-21: guardava i video raccolti dal market harvest, che e uscito. Nessun sostituto.';

comment on table public.market_harvest_runs is
  'DEPRECATED 2026-09-21: il log delle passate del market harvest, che e uscito. Nessun sostituto.';

comment on table public.market_harvest_errors is
  'DEPRECATED 2026-09-21: gli errori non fatali delle passate del market harvest, che e uscito. Nessun sostituto.';

comment on table public.brand_field_posts is
  'DEPRECATED 2026-09-21: legava un brand ai post del suo campo, scoperti dal field watch uscito col market harvest. Nessun sostituto.';
