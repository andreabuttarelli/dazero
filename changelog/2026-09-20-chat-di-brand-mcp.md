# La chat torna, sottile, coi tool del brand presi dal server MCP

La chat era stata smontata in tre commit — `3d1ad402`, `f7da47f4`, `e52fa9be` — per circa
20.000 righe di UI. Il motore no: `src/lib/server/chat/` è rimasto intero, e le tabelle sono vive
(311 thread, 2.333 messaggi). Questa non lo ricollega.

## Perché una rotta nuova invece del motore che c'è

`src/lib/server/chat/` porta system-prompt da 80k, subagents, goal mode, compaction, coda di job.
Serve a turni che durano minuti e si riprendono dopo un crash. Qui la richiesta era l'opposto:
**estremamente leggera**, e con i tool del brand al posto di quelli interni. Rimontare su quel
motore avrebbe voluto dire portarsi dietro proprio la parte da cui la richiesta scappava.

La rotta nuova è `POST /api/v1/brands/:slug/agent`: `streamText`, i tool del server MCP, SSE al
browser. Il modello di riferimento è `api/tools/agent-team/chat`, che fa già esattamente questo
in produzione — stessa forma di stream, quindi il client riusa `applyChatStreamEvent` invece di
un parser nuovo.

## L'MCP è remoto, e il token non passa dal browser

I tool arrivano da `mcp.anomalia.so/mcp` via `listTools()`: **nessun nome di tool è scritto in
questo repo**. Uno aggiunto sul server compare nella chat senza un deploy qui.

Il JWT resta sul server. Il browser parla solo con la nostra rotta; è la rotta che presenta il
Bearer all'MCP, prendendolo da `safeGetSession()`. La strada corta — browser che chiama
direttamente l'MCP, che ha già `Access-Control-Allow-Origin: *` — è stata scartata: metterebbe
il token dell'utente in JS client, cioè esattamente il contrario di «api keys nascoste in BE».

Il token viaggia in `requestInit` e non con un `authProvider`: l'OAuth dance serve a chi il token
deve ottenerlo, e qui la sessione ce l'ha già.

## Due tetti, che sono la stessa preoccupazione

`MCP_TOOL_LIMIT = 40` e `HISTORY_LIMIT = 40`. Tool dichiarati e cronologia viaggiano **nel prompt
di ogni turno**: senza tetto sono un conto che cresce da solo a ogni messaggio, per sempre.

## Un thread per brand

`openBrandThread` cerca per `brand_id` + `user_id` + `surface = 'brand_agent'` e ne crea uno solo
la prima volta. Entri, ricarichi, sei nella stessa conversazione. Il filtro per utente c'è anche
se la RLS lo imporrebbe: senza, il primo SELECT tornerebbe il thread di un collega prima che la
RLS entri in gioco. `surface` distingue perché `chat_threads` porta già i thread di post e
progetti.

Nessuna migration: le colonne c'erano già tutte.

## I media hanno una rotta loro, e non è un doppione

`/media` passa da `authenticate`, che pretende un Bearer; il browser ha un cookie. Abbassare
quella guardia per farci entrare un cookie aprirebbe l'intera superficie CLI, quindi il pannello
ha `agent/assets`, autenticata dalla sessione, che riusa `listBrandMedia`.

## La UI

Tre pannelli dentro la sidebar esistente, con un segmented control in alto — costruito qui perché
`components/ui/` non aveva né tabs né toggle-group. I pannelli **restano montati** e si nascondono
via CSS: smontare il pannello chat a ogni cambio di segmento chiuderebbe lo stream a metà
risposta. Sul rail collassato da 3.25rem il controllo sparisce: tre segmenti non ci stanno.

Invio manda, Shift+Invio va a capo. Frecce per cambiare segmento da tastiera, che è ciò che
distingue un `tablist` da tre bottoni affiancati.

## Quello che non è stato verificato

La build di `main` era già rotta prima di questo branch, per due motivi distinti e indipendenti:
`typecheck-runtime` cade su `onboarding-steps.ts:1106` (`reviewBrandId` non dichiarato, commit
`b9efa560`) e `@vercel/nft` cade con `Cannot read properties of undefined (reading 'shadowDepth')`.
Verificato su un worktree pulito di `main`: stesso errore identico. L'app compila
(`✓ built in 46.20s`); cade il tracer dell'adapter.

Quindi il percorso vero — browser → rotta → MCP → modello — **non è mai stato eseguito**. I test
coprono la traduzione dei tool, i tetti, l'ordine della cronologia e la riapertura del thread; non
coprono una conversazione reale.
