# Le modalità di scatto, e il craft video che sa quale modello legge

Due pezzi che chiudono il mestiere dove mancava: come si inquadra QUESTO scatto, e cosa sbaglia
QUESTO modello video.

## Le modalità: una tabella, non dieci file

`PHOTO_CRAFT_SPECS` dice come si fa una fotografia e vale sempre. Non diceva cosa cambia fra uno
scatto in piano e uno indossato — quale campo si scrive per primo, cosa entra in campo, la trappola
di quella modalità.

Sei righe in `photo-modes.ts`: `hero`, `flat-lay`, `on-model`, `close-up`, `lifestyle`, `studio`.

**`fields` è l'ordine, e l'ordine è il contenuto.** Un flat-lay comincia dalla camera
perpendicolare — o non è un flat-lay — e un hero dalla composizione. Gli stessi campi in un ordine
qualunque descrivono un'altra fotografia, quindi un test verifica che nessuna modalità condivida
l'ordine di un'altra: due ordini uguali sono due righe dove ne basta una.

Quel test ha già trovato un difetto mentre lo scrivevo: `flat-lay` diceva `camera angle` senza dire
QUALE angolo, cioè lasciava implicito il vincolo che definisce la modalità.

**Dieci file sarebbero stati il 40% di duplicazione.** La fonte ha dieci documenti da 74 righe, e il
blocco che chiede di non ridisegnare il prodotto sta identico in tutti e dieci. Una regola scritta
in dieci posti diverge al primo cambiamento, e diverge in silenzio: qui ciò che hanno in comune non
è ricopiato, sta nel pavimento una volta sola. Un test verifica che nessuna modalità ripeta il
mestiere.

Nel prompt la modalità entra dopo il mestiere e prima dello stile del brand: più specifica di «come
si fa una fotografia», meno di «come guarda questo brand». Senza `shotMode` il prompt non dice
niente in merito — un test fissa anche quello, perché una modalità inventata quando nessuno l'ha
chiesta è peggio di nessuna modalità.

## Il craft video, per modello

`buildVideoPrompt` scriveva lo stesso prompt per Seedance, Grok e Kling. Ma:

- **Seedance** aggiunge sottotitoli, loghi e watermark da solo; i riflessi piatti (specchi, vetro,
  acqua ferma) tornano come duplicati rotti — l'acqua in movimento no; oltre quattro persone di
  riferimento produce «gemelli»; per una faccia costante vuole un headshot più una figura intera,
  mai un foglio multi-vista, che legge come persone diverse.
- **Grok** pesa le prime trenta parole, rende per primo ciò che descrivi per primo, e ignora quasi
  sempre le istruzioni su cosa NON mettere.
- **Kling** vuole due-cinque frasi corte, una idea ciascuna, e fonde i personaggi se non li etichetti.

Un prompt solo per tutti e tre è scritto bene per nessuno.

**Sta in un registro, non in un `if`.** Il CLAUDE.md lo dice per le eccezioni: si dichiarano in un
posto solo, accanto al modello che le governa, in una tabella dove il caso nuovo è una riga e tutti
si vedono insieme. Un `if (model === 'seedance')` dentro il costruttore del prompt è la prima di
cinque condizioni sparse che al terzo modello nessuno sa più elencare.

**Per famiglia, non per id esatto.** `seedance-2-5`, `-2`, `-2-fast`, `-2-mini` condividono sintassi
e difetti: legarli uno per uno significherebbe che il prossimo `-2-ultra` esce senza craft e nessuno
se ne accorge — che è esattamente come il pavimento delle immagini era caduto.

Un modello sconosciuto non riceve niente. Mai un consiglio inventato: un test lo fissa.

## Il seam, e il cavo verificato fino in fondo

`buildVideoPrompt` non riceveva il modello. Ora sì, e le note entrano in **un punto solo**: un
involucro attorno ai quattro rami (`composeVideoPrompt`), invece che dentro ognuno. Quattro copie
avrebbero significato quattro punti da aggiornare al prossimo modello, e il quarto dimenticato.

Vanno in coda — la scena resta la prima cosa che il modello legge — ma **prima** della regola del
fotogramma pulito, che chiude il prompt: una regola assoluta con una nota di mestiere dopo sembra
negoziabile. Per riconoscerla in coda, `CLEAN_FRAME_RULE` è diventata una costante invece di una
stringa scritta due volte.

E soprattutto: **`prepareVideoRender` è esportata per il test.** Non basta che `buildVideoPrompt`
sappia usare il modello, deve riceverlo dal percorso che rende davvero — il cavo fra il modello
risolto e il prompt non lo verificava nessuno, ed è esattamente il tipo di collegamento che si
stacca in silenzio. Ora un test parte dal render vero e controlla che il prompt esca con il catalogo
di Seedance dentro.

Un test ha anche corretto una mia assunzione sbagliata: la regola del fotogramma pulito NON chiude
tutti i rami. Nei rami cover e text-to-video la stessa cosa la dice `FIDELITY`. Il test ora misura
il ramo che la emette davvero, invece di pretendere una cosa che il codice non prometteva.

## Le fonti

I dieci `mode-*.md` e i sei `prompt-*.md` di
[SuperCMO Skills](https://github.com/SupercmoHQ/superCMO-skills) (Copyright (c) 2026 Kshitiz Kumar,
Apache-2.0): presi il taglio delle modalità, l'ordine dei campi e i cataloghi dei difetti per
modello, riscritti in forma di registro con il nostro vocabolario. Nessun testo trasportato, come
per il pavimento fotografico.

## Quello che questo commit NON fa

Il giudice del mestiere guarda le immagini, non le clip: un difetto video non ha ancora un controllo
che lo veda. E nessuno passa `shotMode` — l'opzione esiste, il craft arriva, ma chi produce un post
non sceglie ancora la modalità. Sono i due fili che restano, e stanno nel piano
(`docs/research/2026-09-19-craft-e-canvas.md`).
