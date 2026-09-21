# `save_week_seeds` resta, e la ragione scritta accanto era sbagliata

Il tool doveva essere ritirato come gli altri dieci: scrive una riga in
`content_plans`, e i quattro generici raggiungono quella tabella. La ragione per
cui era stato tenuto — «conia gli id di riga stabili, mappa i formati legacy
sull'enum, clampa le capacità media» — descriveva una normalizzazione che si
credeva vivesse nella scrittura. Non ci vive, e la strada proposta per toglierlo
(un trigger `BEFORE INSERT OR UPDATE` che replicasse quella normalizzazione in
plpgsql) avrebbe risolto un problema che non esiste rompendo dati che esistono.

## Dove gira davvero `normalizeWeeklyStrategy`

In LETTURA, su ogni strada che consuma i seeds, non su quella che li scrive:

- `src/routes/app/[brand]/plan/+page.server.ts:98` — la pagina piano;
- `src/lib/server/scheduler.ts:1198` — l'autopilota;
- `src/routes/app/[brand]/content/generate/+server.ts:92` — la generazione;
- `src/lib/server/content-preview/weekly-planner.ts:292` — dentro
  `executeWeekStrategy`, che è la porta da cui passa ANCHE `produce_week`.

Quell'ultima è decisiva: l'endpoint `produce` legge `draft.seeds` grezzi e li
passa a `executeWeekStrategy`, che li rinormalizza prima di guardarli. Quindi
«`insert_row` depositerebbe seeds che `produce_week` non sa produrre» è falso —
`produce_week` li normalizza da sé, e il commento in `weekly-planner.ts` lo dice
da sempre: *defensive re-normalisation, some callers pass seeds straight from
the DB*.

## La prova sta già in produzione

Non è un ragionamento sul codice, è una tabella:

- **112 seed su 155** salvati in `content_plans` non hanno `id`;
- i `format` distinti sono **dieci** (`post`, `reel`, `story`, `short video`,
  `image`, `null`…) contro i cinque dell'enum.

Quelle righe si producono lo stesso, ogni giorno. Se la normalizzazione fosse
in scrittura non esisterebbero. E c'è già una strada che scrive `seeds` del
tutto grezzi, senza passare da nessuna normalizzazione:
`/api/v1/brands/:slug/weekly-plan/save` fa `update({ seeds })` con quello che
riceve. Il tool generico non aprirebbe un buco nuovo: quel buco è aperto, ed è
innocuo perché la lettura lo chiude.

## Perché il trigger sarebbe stato un danno

Spostare la normalizzazione in scrittura non salva le righe già in tabella: le
lascia dove sono e aggiunge una seconda verità. In più avrebbe richiesto in
plpgsql la tabella dei formati legacy (`normalizeContentFormat`), i set di
capacità delle piattaforme (`VISUAL_REQUIRED`, `VIDEO_ONLY`,
`CAROUSEL_PLATFORMS`, `CAPTION_LINK_PLATFORMS`), `normalizeBeats` e uno
`slide_count` che dipende da `CAROUSEL_MAX_SLIDES`, cioè da una variabile
d'ambiente che il database non legge. Due copie della stessa tabella in due
linguaggi divergono al primo formato nuovo — e qui una delle due non può
nemmeno vedere l'env che la governa.

Anche l'indice unico parziale per il draft unico non si poteva creare: un brand
in produzione ha **due** righe `status = 'draft'` in questo momento, e l'indice
sarebbe fallito in costruzione.

## Cosa resta vero, e giustifica il tool

Una cosa sola, quella che `insert_row` davvero non sa fare: **cercare il draft
aperto e aggiornarlo** invece di affiancarne un secondo. Un secondo draft
nasconde il primo nella pagina piano, e un tool che scrive righe non ha modo di
fare quel `select … where status = 'draft' … limit 1` prima di decidere fra
insert e update. La ragione in `retired-tools.test.ts` ora dice questo, e dice
anche esplicitamente che la normalizzazione NON è il motivo — così il prossimo
giro di pulizia non rifà lo stesso ragionamento sbagliato.

Accanto, tre casi in `content-preview.test.ts` fissano la proprietà su cui quella
ragione si appoggia: un seed grezzo prende `id`, enum e clamp **alla rilettura**.
Se qualcuno spostasse la normalizzazione in scrittura, falliscono.
