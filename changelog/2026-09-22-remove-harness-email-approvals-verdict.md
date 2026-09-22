# Harness cancellato, link di approvazione email tolti, verdict.ts sparito

Tre richieste dell'utente, una PR: "harness non deve mai più esistere", "niente link di
approvazione via email", e il chatbot del post singolo — che però non c'era più da trovare.

## `post-editing.ts` non era il chatbot

L'utente pensava fosse il chatbot del post singolo. Letto per intero: 581 righe, zero
`generateText`/`streamText`/`tool()`, solo CRUD e scheduling — `editorActions` (updatePost,
reschedule, cancelSchedule, repost, reject, approve, publishNow), la cancellazione Zernio,
`applyPostEdits`. Usato da `manual-posting.ts`, `publish.ts`, la rotta CLI dei post, il calendario:
codice vivo, non tolto.

Il vero chatbot per-post/per-articolo è già stato cancellato in una PR precedente
(`a69b2fe5 "Remove the per-post and per-article chats"`, merged `304faf28
"kill/post-article-chat"`). Non c'è nulla da rimuovere sotto quel nome: segnalato invece di
cancellare codice che serve.

## `src/lib/server/harness/` cancellato — 8 consumer riscritti, non a caso stessi

`harness` non era un chatbot: era un wrapper di tracing/policy attorno alle chiamate AI SDK
(sessione loggata, persistenza su `agent_sessions`, steward in-loop). Otto punti la usavano, e
sono FEATURE vive, non prodotto vecchio — controllato uno per uno prima di toccarlo:

- `strategy-agent.ts`, `week-planner-agent.ts`, `produce-agent.ts` sono la pipeline dietro
  `anomalia weekly-plan produce` (CLI viva, endpoint `/api/v1/brands/:slug/weekly-plan/*` vivi).
  Non prodotto vecchio — sono state rifiutate come tali nel brief iniziale e verificate: producono
  ancora oggi ciò che l'editorial plan consuma.
- `motion-video/agent.ts`, `media-generator/{agent,ugc-agent,ugc-plan-agent}.ts` reggono
  generazione video/immagine — devono continuare a funzionare, e continuano.

**Cosa ha preso il posto di harness**, senza sessione né persistenza:

- `src/lib/server/agent-steward.ts` — il supervisore in-loop puro (repeat/looping/paid-search-
  senza-brand), estratto 1:1 da `harness/steward.ts`: stesse regole, stesso testo delle note al
  modello, zero dipendenza da una sessione.
- `src/lib/server/agent-tools.ts` — `wrapAgentTools`, l'avvolgimento di `execute()` con log in
  memoria (vive e muore col turno) e gli hook before/after dove lo steward nega una chiamata.
- `src/lib/server/agent-stream.ts` — `streamAgentText`, sostituto di `harnessStreamText` per i due
  agenti che streammano (motion-video, media-generator): stessa logica di primo-tool-forzato su
  `surface: 'chat'` per i modelli grok (misurata: 28.6% dei turni chiudeva a parole senza
  chiamare nulla), stesso steward, senza sessione.

`harness/controller.ts` (lo "shadow controller" di chat, dietro `CHAT_CONTROLLER=shadow`) non
aveva più nessun chiamante reale — `judgeTurnShadow`/`observeIrreversibleAction` erano già morti,
la chat che osservava è quella già rimossa. Cancellato con tutto il resto, nessun sostituto.

## `agent_sessions` diventa una tabella non più scritta

`harness/persist.ts` era l'unico scrittore di `agent_sessions` in produzione (confermato:
`agent-sessions.ts`, un secondo modulo con lo stesso nome di tabella per tracciare le sandbox VM,
non ha chiamanti — dead code indipendente, non toccato). Restano un endpoint di lettura
(`GET /api/v1/brands/:slug/agent-sessions`) e una query CLI (`cli-queries.ts`) che ora leggono
il vuoto: nessuna migration a caduta (il database si ricostruisce), ma la scatola nera dei
sotto-agenti smette di riempirsi. Nessuno l'aveva chiesta per questa PR: segnalato, non riparato.

## `src/lib/agent/bridge/verdict.ts` cancellato — cambio di rotta a metà lavoro

Il brief iniziale elencava 5 importer e diceva di spostare il file. Verificato prima di
spostarlo: 3 di quei 5 erano già stati riscritti da altri agenti in parallelo o non lo
importavano affatto (`post-editing.ts` non l'ha mai importato — falso positivo del brief;
`publish.ts` e la rotta `posts/+server.ts` usano `post-verdict.ts`, un modulo *diverso*, mai
toccato). L'unico importer reale era `harness/controller.ts`, morto con harness. L'utente ha
poi chiesto esplicitamente la cancellazione invece dello spostamento — coerente con quanto
trovato: cancellato `verdict.ts` + `verdict.test.ts`, e con loro `src/lib/agent/bridge/`
(vuota). `src/lib/agent/no-vite-globals.test.ts` — l'unico file rimasto nella cartella,
soggetto indipendente da verdict.ts (guarda `import.meta.env` sotto `lib/server`, non solo
`lib/agent`) — spostato in `src/lib/server/no-vite-globals.test.ts`. `src/lib/agent/` non
esiste più.

**Cosa si perde**: `claimsWithoutFacts`/`looksLikeAPromise` esistevano per bloccare un agente che
DICHIARA un artefatto (video, post, immagine) senza aver chiamato nessuno strumento che lo
produce — il difetto visto dal vivo il 23/8 ("Fatto. Nuovo trailer..." con zero tool chiamati).
Erano cablati SOLO nello shadow controller della chat, che non ha più chiamanti reali: la
protezione era già inerte prima di questa PR, non qualcosa che smette di funzionare oggi. Va
detto comunque, perché è la decisione dell'utente e non doveva sparire in silenzio: su un
prodotto a tela dove una persona vede il contenuto prima che esca, il rischio residuo è basso.

## Link di approvazione via email tolti

`src/routes/approve/[token]/` cancellata (load + action, bulk-approve via token firmato senza
sessione). Con lei:

- `signApproveToken`/`verifyApproveToken` da `src/lib/server/token.ts` (restano `signPayload`/
  `verifyPayload`, generici, usati da OAuth in `oauth.ts` — non toccati).
- `approvalEmailSubject`/`approvalEmailHtml`/`approvalEmailText` e la variante ricorrente
  `schedulerEmailSubject`/`schedulerApprovalEmailHtml`/`schedulerApprovalEmailText` (quest'ultima
  già senza chiamanti prima di questa PR) da `src/lib/server/email.ts`. Restano `postRow`/
  `PreviewPost`/`cta`: li usa ancora l'email di pre-publish-hold.
- L'azione `emailApprove` in `src/routes/p/[projectId]/calendar/+page.server.ts` (mandava
  l'email con il link) e il bottone/stato corrispondente nella `+page.svelte` (`emailEnhance`,
  `emailing`, il flash "email inviata").

Non toccato (di un altro agente, in coordinamento): `email.ts`/`lifecycle.ts` per il resto — solo
i template specifici dell'approvazione sono stati rimossi.

## Verificato

`npx vitest run` sui file toccati: verde. Tre `*.loop.test.ts` (produce/strategy/week-planner) e
`ugc-plan-agent.loop.test.ts` avevano test che asserivano righe scritte su `agent_sessions` —
comportamento che non esiste più, non un difetto. Un test (`produce-agent`, "lascia la riga che
lo dice" sul fallimento) aveva un'intenzione reale e un sostituto vero: `persistAgentRun` scrive
comunque una riga `status: 'failed'` in `agent_runs` (meccanismo separato, mai passato da
harness) — il test ora asserisce quello. Gli altri erano puro artefatto di harness: cancellati.

`nested-agents.test.ts` guardava una tabella per-file "harness vs sdk" per gli orchestratori
batch — riscritta per il traguardo finale (nessuno dei tre è più su harness).
