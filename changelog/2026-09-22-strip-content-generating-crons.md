# I cron non inventano più contenuto

La tela è deliberata: un post nasce perché una persona o un agente per suo conto lo chiede, mai
perché è scoccata un'ora. `vercel.json` aveva ancora 35 righe in `crons`; ne restano 20.

## Le 13 già morte

Puntavano a rotte cancellate dalla demolizione precedente — nessun `+server.ts` esisteva più:
`autopilot/tick`, `autopilot/digest/tick`, `geo/tick`, `geo/reprobe/tick`, `gsc/tick`,
`seo/ranks/tick`, `seo/crawl/tick`, `backlinks/external/tick`, `seo/keywords/tick`,
`seo/review/tick`, `seo/links/tick`, `market/field`, `leads/outcomes`. Ogni giorno Vercel le
chiamava e prendeva un 404 silenzioso.

## Le due che generavano contenuto

- **`weekly-recap/tick`** — il loop "ecco cosa abbiamo prodotto per te" del vecchio prodotto:
  mandava un'email settimanale e faceva girare `runWeeklyReflection` (spesa AI). Cancellati la
  rotta e `weekly-recap.ts` (842 righe + test): nessun altro chiamante.
- **`blog/month/work`** — avanzava lo state machine di "Pianifica il mese"
  (`blog_month_jobs`), ma **nessuna rotta creava mai quella riga**: `startBlogMonthJob` non aveva
  chiamanti, e il commento in cima al modulo lo confermava — "`blog_month_jobs` non ha mai avuto
  una riga". Cancellati la rotta e `blog-month.ts`: era già orfano, oltre a essere esattamente il
  "produce su uno schedule" che il prodotto nuovo rifiuta.

## Cosa resta, e perché

`market-references/tick` e `library/tick` restano: distillano conoscenza (catalogo formati
competitor, pagine del sito) per un piano editoriale che l'utente avvia a mano — non scrivono
post né li propongono nel calendario. `blog/publish-due` e `posts/prepublish/tick` restano:
pubblicano/controllano ciò che una persona ha già programmato, non inventano nulla.
`onboarding/steps/work` e `designer/work` restano: sono worker che finiscono un lavoro iniziato
da una persona (wizard di onboarding, tool motion/UGC in chat), non che lo iniziano da soli.

## Trovato ma non toccato

`blog-generate.ts` contiene `planBlogMonth` e `generatePlannedArticle`, orfani anche loro (zero
chiamanti — il bottone "Genera ora" e il drip che li usavano sono già spariti), ma non erano
raggiungibili da nessun cron: fuori dal perimetro di questo giro, segnalati per una pulizia
dedicata. Stesso discorso per `blog/links/tick` e `library/crawl/tick`: rotte vive, forma da
cron (`cronAuthorized`, cursore round-robin), ma senza riga in `vercel.json` — un gap lasciato
dalla rimozione SEO/GEO del 2026-09-21, non qualcosa che ho aggiunto o tolto oggi.

## Guardia nuova

`vercel-crons.guard.test.ts`: ogni `path` in `crons` deve avere un `+server.ts` sul disco.
Le 13 righe morte non avrebbero mai dovuto passare inosservate: ora un test le blocca.
