-- I LEAD NON ESISTONO PIÙ: via le loro due tabelle e le colonne che servivano solo a loro.
--
-- Il prodotto diventa una tela infinita. Trovare conversazioni, scriverne la bozza, ritrovare il
-- commento dopo che l'umano l'ha incollato e misurarne l'esito: tutto questo è stato tolto dal
-- codice, e queste righe sono ciò che quel codice scriveva.
--
-- PERCHÉ UN DROP E NON UN COMMENT. La regola di 20260921180000 — marcare invece di cancellare —
-- vale per una tabella il cui scrittore ha perso i chiamanti ma potrebbe riaverli. Qui la
-- funzionalità è stata rimossa, non sospesa: non c'è più un lettore, un writer o una rotta da
-- ripristinare, e lasciare le tabelle significherebbe solo che il prossimo lettore dello schema
-- va a cercare un codice che non c'è.
--
-- lead_outcomes prima di lead_suppressions non conta (nessuna le lega), ma brand_news_items
-- perde le colonne DOPO: l'indice che le usa va tolto per primo o il drop lo trascina in
-- silenzio.
--
-- I deploy NON eseguono le migration: applicare a mano.

drop table if exists public.lead_outcomes;

drop table if exists public.lead_suppressions;

drop index if exists public.idx_brand_news_items_author;

alter table public.brand_news_items
  drop column if exists author_handle,
  drop column if exists author_platform,
  drop column if exists dm_draft,
  drop column if exists dm_target;
