-- IL RADAR NON ESISTE PIÙ: via la sua coda, la sua cache, le sue ricerche e la memoria delle
-- community che leggeva.
--
-- Il prodotto diventa una tela infinita. Battere le fonti, mettere in coda una scansione,
-- tenere in caldo un feed e riscrivere il profilo di una community erano il Radar, e sono stati
-- tolti dal codice: queste righe sono ciò che quel codice scriveva.
--
-- PERCHÉ UN DROP E NON UN COMMENT. La regola di 20260921180000 — marcare invece di cancellare —
-- vale per una tabella il cui scrittore ha perso i chiamanti ma potrebbe riaverli. Qui la
-- funzionalità è stata rimossa, non sospesa: non c'è più un lettore, un writer o una rotta da
-- ripristinare.
--
-- COSA NON SI TOCCA. `brand_news_items` e `brand_news_sources` restano: le legge ancora chi
-- prepara i seed della settimana, il recap del lunedì e il prompt della chat. Erano tabelle del
-- Radar solo per provenienza, non per uso.
--
-- L'ORDINE CONTA: `claim_radar_jobs` nomina `radar_jobs` nel suo corpo, quindi la funzione va
-- prima della tabella o resta una routine che punta a un oggetto che non c'è.
--
-- I deploy NON eseguono le migration: applicare a mano.

drop function if exists public.claim_radar_jobs(integer, timestamptz);

drop table if exists public.radar_jobs;

drop table if exists public.radar_feed_cache;

drop table if exists public.radar_searches;

drop table if exists public.brand_community_profiles;
