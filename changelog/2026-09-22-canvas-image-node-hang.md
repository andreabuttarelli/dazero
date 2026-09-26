# Un nodo immagine sulla tela non gira più per sempre

Segnalato: un nodo `image` sulla tela mostrava lo spinner e non usciva mai — nessun errore,
nessun completamento.

## La diagnosi

`node_runs` e `nodes.data` per le tre run reali guardate (`node_id=1c77185d-...`) dicevano
`status='failed'` / `running: false`, non `running`: il server chiudeva il giro correttamente,
in 40-70s. Quindi non è il worker di Fase 3 che manca — le immagini sono sincrone per disegno
(`media-generate.ts`: "niente createTask e niente polling"), e per quei tre run la richiesta ha
avuto tempo di finire.

Il buco è nel tempo che NON ha: `src/routes/p/[projectId]/c/[canvasId]/+page.server.ts`
(l'azione `run`) aspetta la generazione dentro la richiesta HTTP senza dichiarare `maxDuration`
— l'unica rotta in tutto il repo che genera un'immagine e non lo fa. Ogni rotta gemella
(`api/v1/brands/[slug]/media/images`, per dirne una) porta `maxDuration: 300` con lo stesso
commento: "quattro immagini di fila stanno sotto il minuto, ma non sotto il default." Su un
modello lento la richiesta muore contro il default della piattaforma, la funzione non arriva mai
a `completeRun`/`failRun`, e la riga resta `running` senza che nessuno la chiuda — quello che
l'utente ha visto.

## La correzione

- `config = { maxDuration: 300 }` sulla rotta della tela, allineata a ogni altra rotta immagine.
- Rete di sicurezza per quando anche 300s non bastano — un deploy a metà, un crash: un nuovo
  cron (`/api/v1/canvas/runs/tick`, ogni minuto) chiude come `expired` una `node_runs` rimasta
  `running` da più di 6 minuti, riaccendendo il nodo (`running: false`, errore leggibile) così
  il pulsante torna a funzionare senza ricaricare la pagina. `expireStuckRuns` in
  `src/lib/server/canvas/generate.ts`, claim atomico via `claimRun` prima di ogni scrittura —
  la stessa riga già scritta per `video-render-queue.ts`.
- Aggiunto `expireRun` accanto a `failRun` in `node-runs.ts`: `expired` e `failed` restano due
  fatti diversi — il fornitore ha detto di no contro nessuno ha più risposto.

## Cosa NON è stato costruito

Il worker di Fase 3 completo (coda + poll per job esterni come il video, che resta async con
`external_job_id`) non è in questo cambio: le immagini non ne hanno bisogno, essendo sincrone.
Il cron aggiunto qui è solo il timeout — la rete minima che lo spec (`NEW_DATABASE_STRUCTURE.md`,
"Le cose che il cron deve fare oltre al lieto fine") chiede comunque a ogni run, sincrona o no.
