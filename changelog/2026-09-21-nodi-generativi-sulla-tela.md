# I nodi che producono: testo, immagine, video sulla tela

Doppio clic sulla tela, si sceglie fra tre, e nasce un nodo con sopra le sue proprietà (modello,
formato, durata, audio) e sotto la casella del prompt. Finora la tela mostrava cose già fatte;
adesso è anche il posto dove si fanno.

## Quasi tutto c'era già, e questo è il punto

`src/lib/canvas/graph.ts` esisteva da prima e descrive esattamente questo: i tre medium, cosa
accetta ogni tipo, cosa gli serve per girare, quanti riferimenti regge un modello,
e `canConnect` che risponde PRIMA di spendere. Diciannove test verdi che nessuno stava usando,
perché mancava la UI. Il catalogo dei modelli — `get_media_models` — porta già formati, durate,
tetto del prompt e `maxRefs`: sono i campi dell'overlay, uno per uno. Niente di tutto questo è
stato riscritto.

Quel che è stato aggiunto è il *dove vive un nodo prima di produrre*.

## Colonne, non un JSON in `body`

`ref_kind = 'gen'` è l'unico tipo che attraversa un confine: nasce senza riferimento, e lo
acquista girando. Il vincolo `brand_canvas_items_ref_shape` lo vietava — diceva che solo una nota
può stare senza `ref_id`, vero per una bacheca di cose fatte e falso per una tela che le fa — ed è
stato riscritto su tre casi invece di due.

`medium`, `model` e `prompt` sono colonne perché il database può dire che «imagge» non è un
medium, e `write-rules.ts` porta quel rifiuto fino all'agente come una frase invece che come un
23514. `params` resta JSON, e non è incoerenza: formato, durata e audio sono limiti del MODELLO,
vivono accanto a lui, e ricopiarli in colonne significherebbe una migrazione a ogni parametro che
un provider aggiunge.

## Due difetti che i test hanno trovato prima della produzione

Il primo: `hydrateCanvasItems` marcava `missing` ogni nodo senza `ref_id` — cioè ogni nodo appena
creato si sarebbe disegnato come «questa cosa non c'è più». Non è sparito niente: non è ancora
stato fatto.

Il secondo è peggiore e sarebbe esploso in faccia: `REF_SELECT` non ha una riga `gen`, quindi il
primo nodo che avesse prodotto qualcosa avrebbe fatto morire `loadCanvasItems` con un `TypeError`
su `spec.table` — **un nodo riuscito rendeva illeggibile l'intera tela**. Il risultato di un `gen`
sta in `brand_media` come ogni altro asset (una seconda libreria non serve a nessuno), e adesso si
idrata di lì.

Nessuno dei due si vedeva leggendo il codice: entrambi sono usciti scrivendo il test prima.

## Un test che si accontentava di se stesso

`i tipi ammessi sono quelli del vincolo, non una lista parallela` confrontava `CANVAS_REF_KINDS`
con un elenco riscritto a mano lì accanto. Provava che il file era d'accordo con se stesso, non
con il check che morde. Ora legge le migrazioni, prende l'ultimo `ref_kind in (...)` e confronta
con quello — ed è stato visto fallire togliendo `gen` dal codice.

## Il salvataggio, e la lezione che era già stata pagata

Le azioni si chiamano con `x-sveltekit-action`, come fa la tela di `canvas-lab`: senza, SvelteKit
risponde 303, `fetch` segue il redirect da sé e torna l'HTML con `res.ok` vero — si legge
«salvato» mentre non è stato scritto niente. L'esito si legge dal CORPO con `deserialize`, perché
una action risponde 200 anche quando rifiuta, e un prompt perso in silenzio si scopre alla
riapertura, quando non c'è più e nessuno sa perché.

`gen` e `move` sono due azioni separate di proposito: con una sola, un trascinamento riscriverebbe
anche il prompt, e due gesti vicini — la riga appena digitata, la tile appena spostata — si
cancellerebbero a vicenda a seconda di chi arriva per ultimo.

## Cosa NON fa ancora

Il bottone «Genera» è disegnato e collegato allo stato, ma non chiama nessun generatore: manca il
passo che porta `prompt` + `model` + `params` a `generate_image` / `generate_video` e scrive
`ref_id` col risultato. E il catalogo dei modelli nel client è ancora vuoto, quindi il menù del
modello non ha voci: finché non ce n'è uno, «Genera» resta spento — che è meglio di un modello
scelto a caso e pagato.
