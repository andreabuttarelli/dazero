# La pagina incorporata smette di ricaricarsi e si rimpicciolisce col nodo

Due difetti riportati insieme sullo stesso nodo `iframe` della tela, e con una radice diversa
ciascuno. Vale la pena scrivere come sono stati trovati, perché il primo è stato diagnosticato
**escludendo** e non indovinando.

## 1. L'iframe ripartiva da capo di continuo

Un `<iframe>` ricarica per tre motivi e tre soltanto: l'elemento viene **rimontato**, gli si
**riassegna `src`** anche con lo stesso valore, oppure gli **cambia `srcdoc`**. Il sospetto
iniziale era `patchFrame`, che sostituisce l'oggetto del frame a ogni patch
(`frames.map((f) => (f.id === id ? { ...f, ...change } : f))`), e la catena
`tiles` → `syncNodes` → snippet → `IframeNode`. **Non era nessuna delle due**, e i tre meccanismi
sono stati esclusi uno per uno leggendo quel che il compilatore produce davvero:

- **Rimonta?** No. `NodeRenderer` di SvelteFlow itera `{#each ... (node.id)}`, quindi il
  `NodeWrapper` è keyed sull'id e non si ricostruisce. Dentro, `$.if` tiene il ramo per **indice**
  (`BranchManager.ensure(key, fn)`): rivalutare la condizione con un `frame` che è un oggetto
  nuovo non cambia l'indice, quindi il ramo resta quello. E `{@render tile.render(...)}` compila in
  `$.snippet(node, () => tile.render, …)`, che è keyed sull'**identità della funzione snippet** —
  che è stabile, perché lo snippet `tile` è creato una volta dentro il ramo `:then` dell'`{#await}`
  e passato per valore a `CanvasFlow`.
- **`src` riassegnato?** No. `set_attribute` di Svelte confronta e **esce subito** quando il valore
  è identico a quello scritto l'ultima volta (`if (attributes[attribute] === (attributes[attribute] = value)) return;`).
  `embedded` produce una stringa nuova a ogni ricalcolo, ma le stringhe si confrontano per valore.
- **`srcdoc`?** Sul modo «Codice» sì, ed è voluto: si scrive HTML e si guarda il risultato. Non è
  il caso riportato, che era sul modo «Indirizzo».

Restava quel che non è nella lista perché non è nostro: **`loading="lazy"`**. Il caricamento
differito è guidato dall'intersezione, e SvelteFlow tiene ogni nodo dentro un viewport che
trasforma con `scale()`/`translate()` e a cui **riscrive `visibility`** (`style:visibility={hasDimensions ? …}`)
a ogni riconciliazione delle misure — `updateNodeInternals` gira su ogni battito del
`ResizeObserver` di `NodeRenderer`, con `force: true`. In quelle condizioni il differimento si
riarma a ogni pan e a ogni zoom, e ogni riarmo è un caricamento.

Un'anteprima su una tela non ha niente da differire: il nodo lo si è messo lì apposta per
guardarlo. `eager` è il default di un `<iframe>`, quindi la cura è **togliere l'attributo**. Il
test che lo tiene fuori vive in `iframe-reload.test.ts`, e la vecchia asserzione in
`iframe-sandbox.test.ts` che PRETENDEVA `loading="lazy"` è stata tolta: bloccava il difetto dentro.

### Il secondo ciclo, quello che ci siamo creati da soli

Misurare il riquadro con un `ResizeObserver` per calcolare la scala apre un ciclo nuovo, e lo apre
sempre quando un observer scrive in uno stato che influenza la geometria di ciò che osserva:
`measured = { width, height }` è un oggetto **nuovo** a ogni battuta anche con i due numeri
identici, quindi `frameStyle` si ricalcola, lo `style` dell'iframe viene riscritto, il browser
rifà il layout e l'observer riscatta. Il confronto sui numeri prima di scrivere lo chiude, e c'è
un test che lo pretende.

## 2. Il contenuto sembrava «zoomato»

Non lo era: era una **finestra piccola**. `width: 100%` dava all'iframe la larghezza del nodo, cioè
trecento pixel a un sito scritto per una finestra da desktop — che risponde passando al suo
impaginato per telefono, o mostrando il proprio angolo in alto a sinistra a grandezza naturale.

La cura è quella di ogni anteprima: larghezza di **riferimento** all'elemento e riduzione del
risultato con `transform: scale()` più `transform-origin: top left`. L'origine non è un dettaglio —
di default `scale` riduce attorno al centro, e un elemento da 1280 dentro un riquadro da 340
uscirebbe dal nodo in alto a sinistra di metà della differenza, cioè lo stesso sintomo di prima.

Il fattore sta in `iframe-scale.ts`, fuori dal componente, perché è **l'unica parte di tutta la
faccenda verificabile senza un browser**: `embedScale` non supera mai 1 (ingrandire stira il testo,
e un nodo più largo del riferimento la pagina la contiene già comoda) e tratta una misura assente
o assurda come «grandezza naturale», perché il primo battito dell'observer dà 0 e uno 0 dentro una
`transform` fa sparire il riquadro senza che nessuno riceva un errore.

### Lo zoom della tela: si moltiplica, ed è quel che serve

Il nostro `scale` vive dentro il viewport che SvelteFlow trasforma, quindi le due si **compongono**
come qualunque coppia di `transform` annidate. È il comportamento giusto: il nodo si rimpicciolisce
con la tela e la pagina dentro si rimpicciolisce esattamente con lui, restando nella stessa
proporzione a ogni tacca di zoom. Per questo il fattore **non legge** lo zoom per compensarlo:
farlo vorrebbe dire ridisegnare ogni pagina incorporata a ogni battito della rotella, e ottenere
una pagina che cambia impaginato mentre si zooma — l'unica cosa peggiore di quella di prima. Guarda
la misura del riquadro, che è in unità di tela e che lo zoom non tocca.

### 1280 non è configurabile, ed è una decisione

È la soglia sopra la quale i punti di rottura CSS più diffusi danno l'impaginato pieno; sotto i
1024 quasi ogni sito passa a quello per tablet e l'anteprima smette di somigliare a quel che si
vede aprendo il link nella scheda accanto — che è l'unica cosa che deve fare. Un secondo numero per
nodo sarebbe un campo in più da riempire nel momento in cui si incolla un indirizzo, per una scelta
che nove volte su dieci è questa. Il giorno in cui una dashboard incorporata ne pretenderà un'altra
la colonna si aggiunge, ma si aggiunge **allora**, con il caso vero davanti.

## Cosa NON è stato verificato

Non c'è un browser in questa sessione: che la pagina si veda alla scala giusta, e che il
ricaricamento sia davvero finito, **non sono stati visti**. Quel che è stato verificato è il
meccanismo — sorgente di SvelteFlow e di Svelte alla mano — e l'aritmetica del fattore, che ha i
suoi test.
