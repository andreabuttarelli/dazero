# Piano di migrazione al nuovo database

Stato al 2026-09-21. Lo schema nuovo **è già applicato** sul progetto Supabase
`klnswzhhgrqvbfjzioul`: 26 tabelle, RLS attiva su tutte, zero avvisi di sicurezza.
Il vecchio (`kszazivzwievqixcnanp`) resta intatto e in sola lettura.

## Il numero che decide la strategia

```
1.495  chiamate .from() nel codice
  407  file che parlano col database
  109  tabelle distinte usate dal codice
   99  di queste NON esistono nel nuovo schema   ← 91%
   10  sopravvivono come nome, nessuna identica come colonne
```

**Non è una migrazione: è una riscrittura.** Una migrazione sposta lo stesso modello su un altro
database; qui il modello è diverso — non esistono più `brand_kit`, `editorial_plans`,
`brand_memory`, `content_plans`, `gtm_plans`, `onboarding_drafts`. Il canvas non c'era.

Ne segue la regola che governa tutto il piano:

> **Non si adatta il codice vecchio al nuovo schema. Si scrive il codice nuovo, e si cancella il
> vecchio quando il suo sostituto funziona.**

Adattare 1.495 chiamate significherebbe portarsi dietro le assunzioni del prodotto morto dentro
quello nuovo. Le 10 tabelle con lo stesso nome sono la trappola peggiore: `brands` esiste in
entrambi, ma con colonne diverse — un `select *` compila e mente.

---

## Fase 0 — Chiudere quello che è aperto (mezza giornata)

Nulla del lavoro fatto oggi è committato: **200.000+ righe di cancellazioni vivono solo nel
working tree**. È il rischio più alto del progetto in questo momento.

- [ ] Sistemare le 3 rotture rimaste (orfani delle rimozioni, tutte meccaniche)
- [ ] Decidere su `settings` — 27 sottopagine, tenuto perché non era in nessuna delle due liste
- [ ] **Commit su `refactor/strip-legacy-chat-and-marketing`**, anche imperfetto: un commit si
      riscrive, un working tree perso no
- [ ] `git tag pre-new-db` sul commit: il punto a cui tornare

## Fase 1 — Le fondamenta del dato (1-2 giorni)

Nessuna UI. Solo il modo di parlare col database nuovo, e i test che lo tengono onesto.

- [ ] **Tipi generati**, non scritti a mano: `supabase gen types typescript` sul progetto nuovo →
      `src/lib/database.types.ts`. Da qui il compilatore vede le colonne che esistono davvero, ed
      è ciò che rende visibile ogni chiamata vecchia.
- [ ] **Un client solo**, tipizzato, che sostituisce quelli sparsi.
- [ ] **Repository per aggregato**, non query sparse nei componenti: `canvas`, `nodes`, `assets`,
      `posts`, `publishing`, `billing`. È il confine che il CLAUDE.md chiede — un componente non
      parla col database.
- [ ] **I test di tenancy per primi.** `no-cross-tenant-writes.test.ts` esiste perché la fuga fra
      tenant è già successa: va riscritto sul nuovo schema **prima** del codice che dovrebbe
      rispettarlo, non dopo.

⚠️ La RLS è attiva su 26 tabelle: **il codice che usa la service-role key la scavalca**. Ogni punto
che la usa va giustificato in una riga, o diventa il buco da cui si esce dal tenant.

## Fase 2 — Il canvas, verticale e funzionante (3-5 giorni)

Il primo pezzo di prodotto vero. Verticale, non a strati: meglio un canvas che funziona di sei
livelli che non si parlano.

- [ ] `orgs` / `orgs_members` / invito: senza tenant non esiste nient'altro
- [ ] `projects` + `canvases` (progetto senza brand: è il caso normale)
- [ ] `nodes` + `nodes_connections`, con `src/lib/canvas/` — **3.048 righe già scritte e testate**,
      il pezzo più pronto del repo
- [ ] Realtime: `postgres_changes` su `nodes`/`nodes_connections` (publication già configurata)
- [ ] Presence sul canale `canvas:<id>` — riusare `presence-peers.ts`, che risolve già "tre tab
      sono una persona"
- [ ] `assets` + upload su Storage

**Fine fase 2 = si apre una tela, si creano nodi, li si muove, e un'altra persona lo vede.**
Nessun nodo generativo ancora.

## Fase 3 — I nodi che generano (3-4 giorni)

- [ ] `node_runs` + il cron di polling. **Il lock atomico è la riga da non sbagliare** — va copiato
      da `video-render-queue.ts`, che l'ha già risolto (claim prima di ogni operazione non
      idempotente, `attempts` che non si incrementa sui claim di cortesia)
- [ ] `ai_calls` con i token separati (`cached_tokens` dice se il prompt caching funziona)
- [ ] Nodi `text` / `image` / `video` sopra OpenRouter
- [ ] Timeout: una run `running` da troppo diventa `expired`, o il nodo gira per sempre

**Da riusare quasi intatto:** `src/lib/design/` (14.911), `src/remotion/` (1.059),
`src/lib/server/media-generator/` e `motion-video/`. Dipendono da modelli e prompt, non dallo
schema — è la parte che la riscrittura non tocca.

## Fase 4 — I nodi sorgente (2-3 giorni)

- [ ] `social_account_feed` → `social_posts` via ScrapeCreators (client **intatto**, 16 importer)
- [ ] `products` → sincronizzazione per brand; il nodo **filtra**, non scarica
- [ ] `ads` → `competitor_ads` dalla Meta Ad Library, con le due modalità pagina/keyword

## Fase 5 — Promozione e pubblicazione (3-4 giorni)

- [ ] `posts` + `post_sources` (molti-a-molti: un post nasce da più tele)
- [ ] `social_accounts` via Zernio — `zernio.ts` e `publishing/` sopravvivono, provati da 69 test
- [ ] `scheduled_posts` + worker con lock atomico (`status='publishing'` + `attempts`)
- [ ] Calendario per brand

## Fase 6 — Ads Meta (2-3 giorni)

- [ ] `ad_accounts` / `ad_campaigns` / `ad_creatives`
- [ ] `approved_by` obbligatorio quando `actor_kind='agent'`: **una campagna spende soldi veri**
- [ ] Boost di un organico che sta andando bene (`rankBoostCandidates` esiste già)

## Fase 7 — Agenti e MCP (2-3 giorni)

- [ ] `api_keys` con `user_id` obbligatorio — è ciò che dà un `actor_id` anche agli agenti
- [ ] Chat in sidebar sul nuovo schema (`brand-agent/` è già thin: ~1.000 righe)
- [ ] MCP che scrive sul canvas, con l'annuncio di presenza prima di toccare le righe
- [ ] `canvas_events` per l'undo (solo il proprio, ma `before` sempre popolato)

---

## Cosa muore, cosa vive

**Si cancella** (nessuna corrispondenza nel nuovo schema — 99 tabelle):
`brand_kit`, `editorial_plans`, `content_plans`, `brand_memory`, `gtm_plans`, `onboarding_drafts`,
`brand_articles`, `brand_documents`, `competitors`, `people`, `publish_logs`,
`social_post_history`, `brand_knowledge_sources`, `blog_integrations`, e il codice che li legge.

**Si riusa senza modifiche** (non dipende dallo schema):
`src/lib/canvas/` · `src/lib/design/` · `src/remotion/` · `media-generator/` · `motion-video/` ·
`scrapecreators.ts` · `zernio.ts` + `publishing/` · `src/lib/realtime/` · `redact.ts` · i guard SSRF

**Si riscrive contro il nuovo schema:**
tutto `src/lib/server/` che fa query · le 8 pagine superstiti · `/api/v1/**` · il CLI e l'MCP

## Il modo di lavorare che rende sicura la riscrittura

1. **Un solo database alla volta.** Niente doppia scrittura, niente sincronizzazione: il vecchio è
   in sola lettura, il nuovo è l'unico su cui si scrive. La doppia scrittura raddoppia i modi di
   sbagliare e nessuno la spegne mai.
2. **Cancellare mentre si costruisce**, non dopo. Quando un repository nuovo funziona, il vecchio
   codice che leggeva quelle tabelle va via nello stesso commit — altrimenti restano due verità.
3. **I tipi generati come rete.** Dopo la Fase 1, `svelte-check` elenca da solo ogni chiamata
   morta: la lista dei lavori la scrive il compilatore, non una persona.
4. **Verticale, non a strati.** Meglio un canvas che funziona di sei livelli che non si parlano.
5. **Test di tenancy prima del codice.** La RLS è la difesa, ma il codice service-role la scavalca:
   il test è l'unico che se ne accorge.

## I dati vecchi

**Proposta: non si migrano.** I brand veri sono pochi, il modello è diverso, e uno script di
migrazione fra due schemi incompatibili costa più di un reinserimento a mano — con in più il
rischio di portarsi dentro dati sbagliati che sembrano giusti.

Se servisse, l'unica cosa che vale la pena salvare sono i **media già generati** (Storage) e
l'anagrafica dei brand: un CSV, non un ETL.

## Rischi, in ordine

| # | Rischio | Mitigazione |
|---|---|---|
| 1 | **Il lavoro di oggi non è committato** | Fase 0, subito |
| 2 | Il codice service-role scavalca la RLS | Test di tenancy in Fase 1, prima del resto |
| 3 | Le 10 tabelle omonime con colonne diverse | Tipi generati: `select *` non compila più |
| 4 | Doppio addebito sulle generazioni | Lock atomico copiato da `video-render-queue.ts` |
| 5 | Doppia pubblicazione | Stesso lock su `scheduled_posts` |
| 6 | La riscrittura si allarga all'infinito | Le 8 pagine sono il perimetro; tutto il resto è no |

## Stima

**17-24 giorni di lavoro** per arrivare a: canvas collaborativo con nodi generativi, promozione a
post, pubblicazione organica e campagne Meta.

La Fase 2 è quella che dice se il piano regge: se in una settimana il canvas non è vivo, il
problema è nel modello e va ridiscusso prima di andare avanti.
