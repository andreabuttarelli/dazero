# Le connessioni si verificano prima di nascere, e i nodi galleggiano

Due cose nello stesso passaggio, e la prima è la più importante: `canConnect` esisteva, era
testato, e non lo chiamava nessuno.

## Il modello era scritto, il filo era staccato

`src/lib/canvas/graph.ts` risponde da settimane alla domanda «questo arco produrrebbe qualcosa?»
— medium, cosa accetta ogni tipo, cosa serve per girare, quanti riferimenti regge un modello —
con ventiquattro test verdi. La tela intanto lasciava tirare qualunque linea, la salvava sempre
come `derives_from` e non chiedeva niente a nessuno.

Il difetto non era in nessuno dei due pezzi: era fra loro. Ed è il genere che nessun test di
unità vede, perché ognuno dei due passa benissimo da solo — per questo `connect-wiring.test.ts`
legge il SORGENTE del componente e verifica che la prop ci sia. Un test che monta il componente
direbbe che non è esploso, non che la libreria sta chiedendo il permesso.

## `connect-rules.ts`, e perché non basta chiamare `canConnect` dentro il componente

La stessa domanda la fanno tre superfici: `isValidConnection`, che decide se la linea si aggancia;
l'attacco che si colora rosso o viola; il menù dei versi, che non deve proporre «nasce da» fra due
immagini. Tre chiamate scritte nel componente sarebbero tre copie divergenti al primo caso nuovo,
che è esattamente il registro sparso che il CLAUDE.md chiede di non scrivere.

Due decisioni dentro, e sono quelle che contano:

**Chi non si conosce non si rifiuta.** Il recap del workbench non è un `CanvasNode` e non lo sarà
mai: riassume, non produce. Rifiutare ogni tile senza tipo dichiarato spegnerebbe archi fra cose
vere ogni volta che il chiamante non ha ancora descritto un nodo, e il sintomo — «a volte la linea
non si attacca» — è il peggiore da diagnosticare. Chi non deve collegarsi lo dice con
`connectable: false`, che è un'altra domanda e sta in un altro posto.

**`groups_with` non passa da `canConnect`.** Quella funzione risponde a «questo alimenta quello»;
stare insieme non alimenta niente — tre post della stessa campagna non si producono a vicenda.
Quindi un arco che `canConnect` rifiuta NON è un arco impossibile: è un arco che non può essere
quel verso lì, e `edgeKindsFor` lascia comunque «insieme a». È la ragione per cui il menù non è
mai vuoto.

## Il verso non è più sempre lo stesso

`onConnect` porta adesso il `kind` scelto da `edgeKindsFor`, non un `derives_from` fisso. Fra due
immagini si salva `groups_with`, perché è l'unico vero: scrivere «nasce da» sarebbe un dato falso
depositato senza che nessuno l'abbia chiesto, e l'agente lo rileggerebbe come tale al turno dopo.

## Il motivo del rifiuto non si butta via

`canConnect` restituisce `{ok: false, why}` e il `why` è la metà utile. Una linea che
semplicemente non si attacca si legge come un difetto del mouse, e chi l'ha tirata riprova
identico; «un'immagine non alimenta un nodo immagine» chiude il giro al primo tentativo. Arriva
come riquadro sopra la tela, con `pointer-events: none` perché compare a metà gesto e
intercettare il puntatore lo interromperebbe proprio mentre spiega perché non si può.

Le classi degli attacchi (`connectingto`, `valid`) sono lette da `Handle.svelte` della libreria,
non indovinate: la prima stesura aveva scritto `.connecting`, che non esiste, e la regola non
avrebbe mai morso.

## Un arco si toglie e si corregge

`canvas-edge-ops.ts` accanto a `saveCanvasEdge`, che sapeva solo aggiungere. Due funzioni e non
una con un `mode`: cancellare e riscrivere sono due intenzioni, e un interruttore le farebbe
convivere in un corpo con un `if` in mezzo.

`retype` non è un secondo `connect`: l'indice unico è su `(canvas, sorgente, bersaglio, kind)`,
quindi salvare lo stesso arco con un verso diverso farebbe nascere una riga ACCANTO alla prima —
due linee fra le stesse due cose, che dicono cose diverse.

Il filtro su `brand_id` non è ridondante con le RLS: le policy dicono cosa si PUÒ toccare, il
filtro dice cosa si INTENDE toccare. Senza, un id di un'altra tela tornerebbe successo su zero
righe — il modo peggiore di dire «non è successo niente».

## I nodi galleggiano

Su una tela è tutto su un piano solo, e un bordo da un pixel è l'unica cosa che separa un nodo
dallo sfondo: a zoom ridotto sparisce, e restano rettangoli che si confondono col pattern.
L'ombra dà la profondità che il bordo non ha, e cresce sulla selezione perché il nodo su cui si
lavora deve stare AVANTI, non solo essere contornato.

Il fondo era `--paper-2` con la tela su `--paper`: il nodo era più scuro dello sfondo, cioè il
contrario di quel che galleggia. Invertiti.

E il risultato arriva ai bordi. Un'immagine dentro dieci pixel di `padding` è una miniatura con
una cornice, e su una clip verticale la cornice è più larga del contenuto — mentre il nodo esiste
per guardarla. `object-fit: contain` e non `cover`: un'immagine tagliata a metà non si può
giudicare, ed è il giudizio la ragione per cui sta lì.

Il taglio sta sulle fasce interne, una per una, e NON sul guscio: `overflow: hidden` sul nodo
intero mangerebbe la fascia delle proprietà, che gli sporge sopra apposta. È un test, non un
commento.

## Cosa NON è collegato

`+page.svelte` del workbench è di un'altra sessione in questo momento, e lì stanno le ultime due
righe: passare `node: tileNode(n)` sulle tile e inoltrare il `kind` che `onConnect` ora porta.
Finché non ci sono, `verdictBetween` sul workbench trova `null` per ogni tile e — per la regola
scritta sopra — lascia passare tutto. Il collegamento è pronto e verificato dai test; la superficie
che lo accende no.

Stessa cosa per `onEdgeDelete` / `onEdgeRetype`: le action `disconnect` e `retype` esistono e sono
testate, il pannello dell'arco è disegnato in `CanvasFlow`, ma nessuno gli passa ancora i due
callback dal workbench, quindi il pannello non si apre.
