# Due tabelle marcate morte, trentadue assolte

Il database ha 157 tabelle, 34 con zero righe. L'ipotesi di partenza era che una buona parte
fosse codice morto da marcare con `COMMENT ON TABLE`. Verificata una per una, ne restano **due**.

## Perché «vuota» non è la domanda

Contare le righe risponde a una domanda che non serve. `radar_jobs` ha **530 inserimenti
storici** e zero righe vive: è una coda, e vuota significa «niente in attesa adesso» —
`radar_feed_cache` uguale (40 inserimenti, 6.610 update). Marcarle deprecate sarebbe una bugia
che il prossimo lettore paga.

La domanda giusta è una sola: **esiste codice che ci scrive, e quel codice è raggiungibile da un
percorso vivo?** Tre gruppi, non uno.

**A — code e cache, vuote per costruzione.** `radar_jobs` (cron `/api/v1/radar/tick` +
`/work`, e la plpgsql `claim_radar_jobs` che le rivendica), `radar_feed_cache`,
`webhook_deliveries` (`brand-webhooks.ts`, drenata dal cron `/api/v1/webhooks/work`),
`social_thumb_cache` (`design-visual-refs.ts`), `article_views` (la plpgsql `bump_article_view`,
chiamata da `/api/v1/blog/hit`), `push_subscriptions`, `radar_jobs`.

**B — vive, mai usate da un cliente.** Il writer esiste ed è raggiungibile; sono vuote perché
nessuno è ancora arrivato a quella funzione. Venti tabelle, fra cui `ad_campaigns` e `ad_metrics`
(`ads.ts`, cron `/api/v1/ads/tick`), `brand_gsc_metrics` (`gsc.ts`, cron `/api/v1/gsc/tick`),
`brand_tracked_keywords` e `brand_rank_snapshots` (`rank-tracker.ts`, cron `/api/v1/seo/ranks/tick`),
`benchmark_runs` (`benchmark-store.ts`, cron `/api/v1/benchmark/tick`), `brand_visual_insights`
(cron `/api/v1/analytics/visual/tick`), `lead_outcomes` e `lead_suppressions` (cron
`/api/v1/leads/outcomes`), i tre `brand_backlink_*` (`backlink-network.ts`, `backlink-external.ts`,
cron `/api/v1/backlinks/external/tick`), `brand_site_pages`, `blog_categories`, `blog_tags`,
`blog_integrations`, `brand_article_tags`, `shared_views`, `referrals`, `brand_webhooks`,
`brand_triggers`, `brand_job_optouts`, `ads_remix_briefs`, `video_requests`, `org_usage`
(`credits.ts` ci scrive il claim anti-spam degli avvisi crediti).

Cancellarne una romperebbe il prodotto al primo cliente che ci arriva: è la categoria in cui
sbagliare costa di più, perché da fuori è identica alla terza.

**C — morte davvero.** Due.

- **`agent_kit_approval_requests`** — i suoi unici scrittori sono `agent_kit_wait_for_approval` e
  `decide_agent_kit_approval`, funzioni plpgsql che **nessun `.rpc(...)` chiama** da `98b18453`,
  quando la UI delle approvazioni è uscita. `20260905120000_secdef_least_privilege.sql` aveva già
  revocato l'`execute` a `authenticated` dandone la stessa ragione.
- **`brand_design_templates`** — nata con `0108_post_design.sql` insieme a `posts.design`. Dei due
  solo la colonna ha trovato un lettore: in tutto l'albero non esiste una `.from(...)` né un
  `.rpc` che sfiori la tabella.

Il setaccio del 2026-09-04 (`changelog/2026-09-04-codice-morto-secondo-setaccio.md`) le aveva già
nominate entrambe fra le sei «senza un solo lettore applicativo», e segnalate senza toccarle.
Questa volta la conclusione è scritta dove si ritrova.

## Il formato, e perché è uno solo

    DEPRECATED <YYYY-MM-DD>: <perché è morta>. <cosa usare al suo posto>.

Un commento in prosa libera non si può interrogare: chi vuole sapere quante tabelle sono deprecate
finirebbe a leggerle una per una. Con una forma sola la domanda è una `like` su
`obj_description`.

**Scartati**: una tabella `deprecated_tables` con le righe — un secondo posto dove la stessa
verità invecchia per conto suo; e uno schema `graveyard` in cui spostarle, che rompe ogni foreign
key per ottenere quello che un commento ottiene senza toccare un dato.

**Perché un commento e non un `drop`**: qui i deploy non eseguono le migrazioni, quindi una
tabella tolta dal file e presente in produzione è pura divergenza. `COMMENT ON TABLE` è metadato
puro — non può rompere una query, una policy o una foreign key.

## L'allowlist dell'agente: valutata, non toccata

`packages/api-contracts/src/query-tables.ts` è generata da
`scripts/query-tables-from-migrations.mjs`, e far riconoscere allo script il `COMMENT ON TABLE` è
tecnicamente fattibile: il nome della tabella sopravvive a `withoutStringLiterals`, che svuota il
letterale ma lascia `comment on table public.<nome> is ''`.

**Non è stato fatto**, per una ragione che non è la fragilità del parsing:
`src/lib/server/chat/write-tool.ts:54` costruisce il suo `TABLES` **dalla stessa `QUERY_TABLES`**.
Non esiste una lista di sola lettura da cui togliere una tabella: escluderla dall'allowlist
significa renderla invisibile anche a `query`, cioè impedire di ispezionare le righe residue
proprio delle tabelle che si sta decidendo di abbandonare. Il beneficio — «nessuno ci scrive più»
— è ipotetico su due tabelle che hanno zero righe e zero scrittori; il costo è immediato.

Meglio un commento che un'esclusione che sbaglia.

## Verifica

`src/lib/server/deprecated-tables.test.ts` afferma **quali** tabelle sono marcate e che il formato
è rispettato, e nomina esplicitamente sei tabelle vive (`radar_jobs`, `radar_feed_cache`,
`webhook_deliveries`, `org_usage`, `ad_campaigns`, `brand_webhooks`) che non devono comparire:
è il difetto vero da prevenire, perché marcare una coda è l'errore facile da fare e difficile da
accorgersene. Togliere una deprecazione è togliere una riga da quell'elenco, quindi si vede nel
diff invece di accadere in silenzio.

Migrazione applicata e riletta con `obj_description`: entrambi i commenti sono in produzione.
`node scripts/schema-drift-check.mjs` verde prima e dopo.

## Niente changelog pubblico

Due tabelle vuote che nessun codice raggiunge: non c'è un solo gesto che un cliente faccia
diversamente da ieri. Il cambiamento è interamente per chi legge lo schema.
