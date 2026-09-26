-- SEO E GEO NON ESISTONO PIÙ: via i piani, le keyword, le posizioni, Search Console e le
-- sottomissioni di backlink esterni.
--
-- Il prodotto torna a essere social + autoblog. Fare un audit tecnico, comprare volumi e
-- difficoltà da DataForSEO, interrogare i motori per vedere chi viene citato, seguire la
-- posizione di una keyword e ordinare una directory listing erano il ramo SEO/GEO, e sono stati
-- tolti dal codice: queste righe sono ciò che quel codice scriveva.
--
-- PERCHÉ UN DROP E NON UN COMMENT. La regola di 20260921180000 — marcare invece di cancellare —
-- vale per una tabella il cui scrittore ha perso i chiamanti ma potrebbe riaverli. Qui la
-- funzionalità è stata rimossa, non sospesa: non c'è più un lettore, un writer o una rotta da
-- ripristinare.
--
-- COSA NON SI TOCCA, ed è la parte che conta:
--
--   `brand_backlink_placements` e `brand_backlink_opportunities` RESTANO. Non sono il SEO: sono
--   il grafo di link incrociati fra gli articoli dei brand di Anomalia, che l'autoblog scrive a
--   ogni pubblicazione (backlink-network.ts) e legge per il prompt dell'articolo. Erano sotto la
--   voce "backlinks" solo per nome. `brand_backlink_orders` invece se ne va: era la coda delle
--   sottomissioni a SubmitForBacklinks, un servizio esterno, e quel codice non c'è più.
--
--   `brand_geo_audits` e `brand_geo_artifacts` RESTANO per ora: le legge ancora web-evidence.ts
--   dietro `/api/v1/brands/:slug/web/{audits,fixes}`. Quella superficie è l'ultimo residuo del
--   ramo GEO e va tolta con la sua PR; finché la rotta risponde, la tabella non si cancella —
--   un drop qui darebbe un 500 invece di una lista vuota.
--
--   `brand_pages` e `brand_site_pages` RESTANO: sono la libreria del sito e le landing pubblicate,
--   che l'autoblog usa per i link interni.
--
-- L'ORDINE CONTA: `brand_rank_snapshots` ha una FK su `brand_tracked_keywords`, quindi i
-- posizionamenti vanno prima delle keyword che li tengono, o il drop del padre fallisce.
--
-- I deploy NON eseguono le migration: applicare a mano.

drop table if exists public.brand_rank_snapshots;
drop table if exists public.brand_tracked_keywords;

drop table if exists public.brand_seo_plans;
drop table if exists public.brand_seo_keyword_strategy;

drop table if exists public.brand_geo_opportunities;
drop table if exists public.brand_geo_prompts;

drop table if exists public.brand_gsc_metrics;
drop table if exists public.brand_gsc_connections;

drop table if exists public.brand_backlink_orders;
