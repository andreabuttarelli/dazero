# Via il ramo SEO/GEO, resta l'autoblog

Il prodotto torna a essere social + autoblog. Sono stati rimossi gli agenti SEO e GEO, la
ricerca keyword, il rank tracking, Google Search Console e l'acquisto di listing esterni
(SubmitForBacklinks), con le loro pagine, rotte, cron, tool MCP e comandi CLI.

## Cosa NON è stato toccato, e perché

L'autoblog **non era indipendente dal SEO**, contrariamente a come sembrava dall'elenco dei file:
`blog-generate.ts` importava `ensureKeywordStrategy` da `seo-keyword-strategy.ts`, `bestVariant`
da `geo-artifacts.ts` e `proposeBacklinkOrder` da `backlink-external.ts`. Tre nodi, tre decisioni
diverse:

- **`bestVariant` è stato estratto** in `best-variant.ts`. Non è GEO: è il generatore di N varianti
  con reviewer che sceglie la migliore, e l'articolo lo usa a ogni stesura. Stava in
  `geo-artifacts.ts` per accidente storico. Il prompt del reviewer parlava di "GEO reviewer" e
  ora parla di contenuto.
- **`backlink-network.ts` resta intero.** Non è il SEO: è il grafo di link incrociati fra gli
  articoli dei brand di Anomalia, scritto a ogni pubblicazione e letto nel prompt dell'articolo.
  Sei dei suoi export sono nel percorso autoblog. Condivideva solo il nome con i backlink esterni,
  che invece se ne vanno.
- **La keyword strategy è stata tolta dal prompt** dell'articolo: era un blocco di contesto, non
  una dipendenza strutturale. `targetKeyword` resta nello schema del topic, lo decide il modello.

Stessa logica per i due cron sotto `/api/v1/seo/`: `links/tick` (interlinking fra articoli) e
`crawl/tick` (indicizzazione delle pagine del sito nella libreria) non sono SEO — servono blog e
libreria — e sono stati **spostati** a `/api/v1/blog/links/tick` e `/api/v1/library/crawl/tick`
invece che cancellati. `ranks/tick` invece era davvero rank tracking ed è sparito.

`analytics-review-agent.ts` **resta**: è l'agente che rilegge la performance dei post e del blog e
riscrive il brief della settimana. Il SEO era una riga di contesto su 901; è stata tolta.

## Superfici ripulite a cascata

Togliere le pagine ha lasciato orfani che sarebbero rimasti a leggere tabelle in via di
cancellazione: i pannelli SEO/GEO di `hub-overview.ts` (tre builder), gli anelli della home in
`HomeWorkbench.svelte` con `home-gauges.ts`, i passi GSC/GEO di `web-activation.ts`, il check
`gsc` di `growth-readiness`, il warning `no-geo-audit`, la voce `seo` della setup checklist, i job
`seo`/`geo` del roster e i KPI di posizione nel recap del lunedì (con `rank-delta.ts`).

`dataforseo.ts` e `rank-tracker.ts` sono stati rimossi in un secondo passaggio: dopo la
cancellazione degli agenti l'unico chiamante rimasto era il rank tracking, cioè loro stessi.

## Cosa resta da fare

`web-evidence.ts` e le rotte `/api/v1/brands/:slug/web/{audits,fixes}` sono l'ultimo residuo GEO:
leggono `brand_geo_audits` e `brand_geo_artifacts`. Erano in modifica concorrente durante questo
lavoro e vanno tolte con la loro PR — per questo la migration **non** cancella quelle due tabelle:
un drop mentre la rotta risponde darebbe un 500 invece di una lista vuota.

## Migration

`20260921230000_drop_seo_geo.sql` cancella le tabelle davvero orfane. Tiene
`brand_backlink_placements` / `brand_backlink_opportunities` (le scrive l'autoblog) e le due
tabelle GEO di cui sopra. L'ordine conta: `brand_rank_snapshots` ha una FK su
`brand_tracked_keywords`.
