# Nove cron in meno, e l'autoblog cancellato intero

Utente: "elimina tutti e 10 e anche l'autoblog" — anche `lifecycle/tick` (il decimo), ma su
quello si tocca solo il cron e la rotta: `lifecycle.ts` resta di un altro agente che lavora sulle
email.

## I nove cron cancellati (cron entry + rotta)

`ads/tick`, `analytics/review/tick`, `analytics/visual/tick`, `benchmark/tick`,
`blog/publish-due`, `designer/work`, `library/tick`, `memory/dream`, e la rotta di
`lifecycle/tick` (senza toccare il modulo). Per ognuno, il modulo dietro è stato cancellato
SOLO se il tick era il suo unico chiamante:

- `analytics-review-agent.ts`, `visual-insights.ts` (+ test), `designer-work.ts` — cancellati,
  zero altri chiamanti.
- `ads.ts`, `benchmark-store.ts`, `content-library.ts`, `brand-memory.ts` — restano: hanno rotte
  o pagine vive che li chiamano ancora (settings/ads, benchmark/run, settings/library, memoria
  chat).
- `library/crawl/tick`, mai in `vercel.json` (gap lasciato dalla demolizione SEO/GEO), chiamava
  `site-crawl.ts` — cancellato con l'autoblog: la rotta sarebbe rimasta un import rotto.

`brand-doctor.ts` aveva un'intera sezione (`assessLoops`) dedicata al gate dell'analytics
review, allineata 1:1 al tick cancellato: tolta, con `ANALYTICS_FRESH_DAYS`,
`lastAnalyticsRunAt` e la query `agent_runs` che la riempiva. `analytics_review` resta un job
del roster (`job-roster.ts`) e un'automazione (`cli/lib/contracts/automations.ts`): non l'ho
toccato, stesso trattamento che `weekly_recap` ha già da un giro precedente — un'automazione può
sopravvivere al suo cron senza essere rotta, è solo un interruttore che oggi non muove niente.

## L'autoblog, per intero

Moduli server: tutti i `blog-*.ts` sotto `src/lib` e `src/lib/server` (generate, settings, site,
style, translate, cost, humanizer, locales, analytics + i test), `article-*.ts`
(editing/cover/score), `web-activation.ts`/`web-evidence.ts` (mai esistiti — nomi dal brief che
non trovano riscontro nel codice), `site-pages.ts`, `site-crawl.ts`, `internal-links.ts`,
`indexing.ts` (IndexNow/Exa per il blog), `shopify.ts`/`webflow.ts`/`wix.ts`/`cms-sync.ts` (sync
CMS esterno, trovati seguendo un import rotto lasciato da `blog-site.ts`).

Rotte pubbliche: `/blog/[site]/**`, `/blog-preview/[id]`, `/_site/**` (il gemello per dominio
custom — stessi componenti `BlogShell` ecc., non nominato nel brief ma trovato seguendo gli
import), `/(public)/docs/blog-hosting`, `/(public)/docs/api/articles`.

Rotte API: `/api/v1/blog/**` (incluse `hit` e `links/tick`, mai in `vercel.json`),
`/api/v1/brands/[slug]/web/**`, `/api/v1/brands/[slug]/articles/**`,
`/api/v1/brands/[slug]/settings/blog/**`, `/api/v1/library/crawl/tick`.

Componenti: `src/lib/components/blog/**` (14 file).

Gate di piano: `hasBlogIntegrations`, `hasBlogCustomDomain`, `hasWebHub`,
`hasBacklinkNetwork` da `$lib/plans` — tutti zero chiamanti dopo la cancellazione delle rotte
che li usavano. `blogArticlesPerWeek(Max)`, `blogArticlesPerMonth`, `blogTranslationLanguages`
da `$lib/server/plans` — stesso destino, insieme al re-export che importava le quattro funzioni
sparite da `$lib/plans` (avrebbe smesso di compilare).

## Moduli condivisi: tolto il pezzo blog, tenuto il resto

- `hub-overview.ts` — `loadWebOverview` e `loadPublishOverview` erano già senza chiamanti
  (dead code trovato durante il giro, non nuovo): cancellati insieme ai tipi `WebOverview` e
  `PublishOverview`. `loadHomeOverview` (VIVA, la usa il workbench) aveva `blog: {...}` nel
  suo ritorno e due query su `brand_articles`: tolte. `deriveUpcomingBlogs`/`BlogFactRow` con
  loro.
- `home-headline.ts`, `home-upcoming.ts` — la home mescolava post e articoli in una coda sola
  (`upcomingFeed`) e contava gli articoli pendenti nel "quanti aspettano" (`homeHeadline`): ora
  solo social.
- `HomeHead.svelte`, `HomeWorkbench.svelte` — la card vuota della home non propone più "vai al
  blog"; la striscia "cosa esce" non ha più la spunta BLOG.
- `content-preview/articles.ts` — `generateArticleCover`, `editArticleImage`,
  `generateArticleImages` cancellate (autoblog); `replaceMarkdownImageUrl` cancellata (zero
  chiamanti fuori dal proprio test); `regeneratePost` RESTA — è il rigeneratore di post social
  (post-editor, approvals), niente a che fare col blog nonostante il file si chiami `articles.ts`.
- `calendar/+page.server.ts` e `+page.svelte` — il calendario mostrava post social E articoli
  blog nella stessa griglia/lista, con selezione multipla "o tutti social o tutti blog" e due
  action (`publishSelectedArticles`, `deleteSelectedArticles`) che scrivevano su `brand_articles`
  e chiamavano `cms-sync.ts`. Tolto tutto il ramo blog: query `brand_articles`, mappatura
  `articleCal`, badge "BLOG", le due action, il tipo `CalendarPost.kind` ristretto a `'social'`.
- `prompt-enhance.ts` — importava `tokenize` da `backlink-network.ts` (cancellato con
  l'autoblog): la funzione pura (10 righe + stopword) è stata spostata dentro `prompt-enhance.ts`
  invece di farla vivere in un modulo a sé per un solo chiamante.
- `publishing-settings.ts`/test — il commento e il test citavano `publishDueArticles` in
  `blog-generate.ts` come prova che il gate di revisione umana copre anche il blog: la prova non
  serve più, tolta insieme al riferimento.

## Il registro CLI/MCP (`packages/api-contracts` + il suo mirror `cli/lib/contracts`)

Nove tool ritirati per intero, non "sostituiti da un generico": `create_article`,
`update_article`, `publish_article`, `unpublish_article`, `delete_article`, `generate_article`,
`optimize_article`, `add_blog_term`, `set_blog_settings`. A differenza del pattern
"tool ritirato, contratto resta esportato perché la rotta REST resta" già in uso nel file, qui
anche la rotta è sparita: i contratti (`articles.ts`, `blog-settings.ts`) sono stati cancellati
del tutto, non solo tolti da `BRAND_ENDPOINTS`. Il test `retired-tools.test.ts` ha una nuova
sezione (`RETIRED_WITH_AUTOBLOG`) per tenerli fuori, distinta da `RETIRED`/`RETIRED_GENERATORS`
perché il motivo del ritiro è diverso — feature sparita, non consolidata in un tool più generico.
`registry.test.ts` (rotte sotto `[slug]`) aggiornato: le sei rotte REST-only che dichiarava per
gli articoli/blog non esistono più su disco.

Comando CLI `dazero web <slug>` (list/generate/publish/unpublish/optimize/delete) cancellato:
`cli/commands/web.ts`, la sua entry in `cli.ts`, `getWeb`/`webAction`/`WebArticle` da
`cli/lib/api.ts`. Skill doc aggiornate (`cli/skills/dazero/references/cli.md` e il suo mirror
sotto `cli/plugins/`) per non nominare più il comando.

## Le tre trappole del brief

- **`best-variant.ts`** — un solo chiamante, `blog-generate.ts`. Cancellato con l'autoblog.
- **`backlink-network.ts`** — nonostante il nome, è il grafo di link fra articoli che l'autoblog
  scriveva a ogni pubblicazione, non i backlink esterni. Un solo chiamante fuori dall'autoblog:
  `prompt-enhance.ts`, e solo per `tokenize` (spostata inline, vedi sopra). **Non esiste** nel
  repo una rotta `/api/v1/brands/:slug/backlinks` — il riferimento in CLAUDE.md non trova
  riscontro nel codice attuale, verificato con grep su tutto `src/routes`.
- **`src/lib/seo.ts`** — non toccato. È l'helper di metadata del sito marketing (sitemap,
  robots, canonical), non la feature SEO verticale.

## Trovato ma fuori perimetro

- `src/lib/plans.ts` (`PLANS`, il contenuto delle card prezzi) promette ancora blog/backlink
  network come feature dei piani a pagamento (`articlesPerMonth`, "Backlink network across dazero
  brands" negli highlights). Rimuovere le funzioni di gate dietro quella promessa senza toccare
  la promessa stessa lascia la pagina prezzi a vendere una feature che non esiste più — è una
  decisione di prodotto/copy, non una cancellazione di codice morto, e resta per un giro
  dedicato.
- `BLOG_IMAGE_MODEL` (`content-preview/images.ts`) è ora senza chiamanti in produzione (solo il
  proprio test lo esercita): non cancellato, perché tocca un modulo condiviso grande e il
  guadagno di rimuoverlo ora non giustificava il rischio.
