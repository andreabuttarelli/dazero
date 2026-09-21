# Le scorciatoie da tastiera della tela

La tela si usava solo col puntatore: ogni gesto — aggiungere, inquadrare,
spostare di un filo un nodo appena messo — passava da un clic o da un
trascinamento. Su una superficie dove si sta a guardare e sistemare per minuti,
è la differenza fra lavorarci e combatterci.

## Dove sta la decisione

`src/lib/canvas/shortcuts.ts`: quale tasto significa cosa, e soprattutto quando
non significa niente. Il riconoscimento è puro e testato da solo; l'esecuzione
sta in `CanvasKeys.svelte`, che è una presa di corrente senza disegno — la
stessa divisione di `$lib/shortcuts.ts`, il registro globale del prodotto, e
la stessa ragione: la scheda che elenca le scorciatoie è generata dalla lista
che i tasti usano davvero, quindi non può mentire.

Due registri e non uno, di proposito. Quello globale decide dove si va (`g` +
lettera, ⌘K); questo decide cosa si fa a ciò che è selezionato, e quei tasti
hanno senso solo mentre si guarda una tela. Metterli lassù vorrebbe dire una
scheda di aiuto che elenca «sposta la selezione» su ogni pagina del prodotto.

`CanvasKeys` vive DENTRO `SvelteFlow`, come `CanvasPointer` e per lo stesso
motivo già pagato: `useSvelteFlow` legge il contesto che solo lui apre, e
montato fuori il componente si compila, non esplode e non fa niente.

## I tasti, e cosa è stato scartato

| Tasto | Cosa fa |
|---|---|
| `1`–`4` | aggiunge, nell'ordine in cui la barra mostra le voci |
| `⌫` / `Canc` | toglie la selezione |
| `⌘A` | seleziona tutto |
| `Esc` | deseleziona |
| `←↑↓→` | sposta la selezione di 8 unità, con `⇧` di 64 |
| `0` | inquadra tutto |
| `+` / `-` | scala |

**Nessuna lettera nuda.** Il registro globale usa `g` come prefisso: dopo `g`,
qualunque lettera è la seconda di una sequenza. Una `d` nuda qui sarebbe
«duplica» e insieme la `g d` che porta ai Leads, e a decidere sarebbe l'ordine
in cui due ascoltatori su `window` ricevono lo stesso evento. Un gesto, due
padroni: scartata. I numeri non hanno quel problema, e in cambio costano una
mnemonica in meno — il numero sta nel `title` di ogni voce della barra.

**Duplicare non c'è.** ⌘D è del browser e il registro globale lo dichiara già
preso; ⌘⇧D sarebbe libero, ma duplicare una tile vuol dire scrivere una riga
nuova, e quella scrittura non esiste. Un tasto che copia solo il disegno darebbe
una tile che sparisce alla prossima apertura: peggio di un tasto che non c'è,
perché il lavoro perso si scopre dopo.

**Esc non si intercetta.** Il registro globale lo dice: lo gestisce ogni overlay
per sé, e un `preventDefault` centrale lo ruberebbe a menu e dropdown. Qui si
riconosce come «deseleziona», ma `preventable()` lo esclude — così il menù del
doppio clic continua a chiudersi con lo stesso tasto. È l'unica eccezione, e sta
in una funzione invece che in un `if` dentro chi esegue.

**Cancellare non chiede conferma.** La conferma protegge da ciò che non si può
disfare, e su una tela il pentimento ha già la sua strada: il nodo si riaggiunge
con un tasto, ed è lo stesso gesto che l'ha creato. Una modale a ogni `⌫`
costerebbe un'interruzione su ogni cancellazione voluta — quasi tutte — per
salvare quella sbagliata, che si ripara in un secondo. Quello che questa scelta
esige è che il tasto non scatti mentre si scrive.

## Il difetto che il primo test guarda

Sulla tela ci sono `textarea` per i prompt e `input` per gli indirizzi: un
Backspace battuto dentro una caption che cancella i nodi selezionati non è un
caso limite, è il gesto più frequente che esista in quei campi. `matchCanvasShortcut`
riusa `isTypingTarget` del registro globale — non una copia — e restituisce
`null` per qualunque tasto, modificatori inclusi: ⌘A dentro una textarea
seleziona il testo, ed è quello che l'utente sta chiedendo. Sono i primi 40 test
del file, e sono stati scritti prima del modulo.

Lo stesso vale per `preventDefault`, che sta sotto condizione e dopo il
riconoscimento: chiamato prima mangia quel Backspace, ed è un difetto che
nessun test sul risultato vede.

## Quel che manca, e perché

`deleteCanvasItems` (`src/lib/server/canvas-delete.ts`) e l'action `remove`
esistono e sono testate: la cancellazione plurale in una chiamata sola — un giro
per ogni id lascerebbe cancellazioni a metà — e il filtro su `brand_id` accanto
agli id, che arrivano dal client e senza quel filtro raggiungerebbero la tela di
un altro brand.

**Non sono collegate.** `CanvasKeys` espone `ondelete`, `CanvasFlow` non lo
passa e la pagina non lo consuma: lo stato dei nodi vive in
`workbench/+page.svelte`, che in questo momento è in mano ad altri. `⌫` oggi
non toglie niente. Collegarlo è una riga in `CanvasFlow` e una funzione nella
pagina, il giorno che i due file si possono toccare insieme.
