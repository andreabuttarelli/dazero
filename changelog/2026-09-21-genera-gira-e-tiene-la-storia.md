# «Genera» gira davvero, e tiene la storia di quel che ha fatto

Due cose nello stesso passaggio, e la seconda esiste perché la prima da sola avrebbe introdotto
un difetto peggiore di quello che chiudeva.

## Il filo staccato

`GenNode.svelte` chiamava `onrun?.()`. Il workbench lo montava senza quella prop. Con la prop
assente l'optional call è un no-op silenzioso: il bottone si accendeva e si spegneva sullo stato
del nodo — prompt scritto, modello scelto — e premerlo non chiamava nessuno.

È lo stesso difetto di `canConnect` di stamattina, e vale la pena dirlo perché è il secondo in un
giorno: **un modello giusto e un gesto giusto, e niente in mezzo**. Nessun test di unità lo vede,
perché ognuno dei due pezzi passa benissimo da solo — il nodo chiama quel che gli hanno dato, la
pagina monta un componente che non esplode.

Quindi il guardiano è dello stesso tipo: `gen-run-wiring.test.ts` legge il SORGENTE della pagina e
verifica che la prop ci sia. Verificato che fallisce togliendo `onrun`, che è l'unica prova che
serva a qualcosa.

## Perché una action e non la rotta `/api/v1`

Gli endpoint ci sono e non sono stati riscritti: `generateBrandImages` e `generateBrandVideo` sono
gli stessi che servono `POST /media/images` e `POST /media/videos`. Ma quelle rotte vogliono un
Bearer, e il workbench vive su una sessione con cookie — chiamarle via HTTP avrebbe voluto dire
coniare un token per parlare con noi stessi. La tela passa dalle sue action, come già fa per tutto
il resto, e `canvas-generate.ts` chiama gli stessi motori: l'ingresso è diverso, il motore è uno.

`gateAiAction` è sulla action che spende e **solo** su quella. `restore` — tornare a un giro di
prima — non tocca nessun motore, e metterci il cancello significherebbe che guardare indietro può
fallire perché i crediti sono finiti.

**Un solo render per giro.** Le rotte accettano `count` perché un agente che chiede tre alternative
le guarda tutte; un nodo mostra un risultato solo, e tre render per buttarne due sono due addebiti
regalati. Chi ne vuole tre preme tre volte — e adesso la storia se le tiene tutte.

## La storia: una tabella, non un array

`ref_id` era uno solo: rigenerare lo sovrascriveva. Il file non si perdeva — resta in
`brand_media` — ma il **legame** sì, e un legame perso non si ricostruisce: ritrovare quell'immagine
voleva dire cercarla a mano in una libreria dove ogni brand ne ha centinaia che si somigliano.

`brand_canvas_item_runs`: una riga per esecuzione. L'alternativa era un jsonb sulla riga del nodo,
più corta, e si vede dove finisce — nessuna FK verso `brand_media`, quindi un id inventato ci entra
e nessuno se ne accorge finché la tela non prova a disegnarlo; nessuna interrogazione possibile,
quindi «quanto ha speso questo brand sulla tela» diventa una scansione di JSON.

Coerente col resto dello schema anche in una cosa che sembra il contrario: `params` resta jsonb,
perché lì dentro ci sono le scelte del MODELLO, che cambiano quando un provider aggiunge un
parametro. Nella tabella dei giri invece c'è un fatto — questo giro ha prodotto questo asset — e i
fatti hanno colonne.

**Prompt e modello si copiano nella riga**, ed è l'unica copia che questo schema si concede. Ovunque
altrove una tile punta e non duplica. Qui è il contrario: il prompt sul nodo è quello che si sta
scrivendo ADESSO e cambia dieci volte dopo che un giro è partito. Rimandare a lui racconterebbe che
l'immagine di ieri è nata dalla frase di stamattina.

**`ref_id` resta**, e non è ridondanza: è «quella che si vede adesso». Senza, tornare indietro su un
giro vecchio durerebbe fino alla ricarica.

**L'ordine di scrittura è il difetto che `canvas-run.ts` chiude**: prima la riga di storia, poi
`ref_id`. Al contrario, una registrazione fallita dopo lo spostamento perderebbe la generazione
precedente — esattamente ciò per cui la tabella esiste. Un test lo tiene, e fallisce se si invertono.

## Il nodo TESTO non gira, e lo dice

Non è pigrizia: `ref_id` di un nodo punta a `brand_media`, e quel vincolo è
`kind in ('image','video')` — verificato sul database, non supposto. Un testo generato non è un
file e non ha una riga in cui depositarsi.

Scartato: mandarlo al centralino e tenerlo in `body`. Sarebbe stato poche righe, ma `body` è il
testo di una NOTA, e riusarlo darebbe una colonna che significa due cose a seconda del vicino — la
stessa ragione per cui il nodo che produce ha avuto colonne sue invece di un JSON dentro `body`.

Quindi il bottone resta spento **con un perché visibile**. Che è anche il secondo difetto del
bottone originale: era spento e muto, quindi indistinguibile da uno rotto — «non funziona» era una
diagnosi ragionevole. Adesso i motivi stanno in un registro ordinato (`BLOCKED` in
`gen-history.ts`), uno solo, invece che sparsi fra il bottone che si disabilita e la frase che lo
spiega: due condizioni che divergono in silenzio.

## Il doppio clic

`running` si alza PRIMA della chiamata e si riabbassa comunque, anche in errore. Alzarlo dopo
lascerebbe aperta proprio la finestra in cui si clicca due volte — due render veri di cui uno
sovrascrive l'altro atterrando. Non abbassarlo mai lascerebbe un nodo che non si rilancia più senza
ricaricare. Entrambi sono tenuti da un test che legge il sorgente, perché entrambi sono ordini fra
righe, non valori.

Un lucchetto sul server è stato scartato: vorrebbe una riga di stato condivisa e una scadenza per
quando il browser muore a metà giro, complessità pagata oggi per un caso che il bottone già copre.

## Cosa NON è verificato

**Una generazione vera non l'ho mai vista girare**: costa crediti veri di un brand reale. Il
percorso è coperto da test con i motori finti — che il medium giusto chiami il motore giusto, che
un clip torni senza asset, che un `id` null non si spacci per fatto — ma la catena completa fino a
un'immagine dentro il nodo non è stata osservata.
