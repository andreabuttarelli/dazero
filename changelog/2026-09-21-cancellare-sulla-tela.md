# Cancellare sulla tela, fino alla riga

Su `/app/<slug>/workbench` cancellare un nodo o una linea non funzionava: sparivano
per un attimo e tornavano in scena.

## Il meccanismo, che non era quello che sembrava

La ricostruzione di partenza diceva «il filo non è collegato», ed era vera solo a
metà. `deleteCanvasItems` e `deleteCanvasEdge` erano scritti e verdi, le action
`remove` e `disconnect` c'erano, `CanvasKeys` esponeva `ondelete` — e nessuno lo
passava. Ma il nodo non spariva-e-tornava perché nessuno faceva niente: spariva
perché a cancellarlo era SVELTEFLOW.

`KeyHandler` della libreria ha `deleteKey = 'Backspace'` di default e chiama
`deleteElements` da sé. Il nodo usciva dallo stato interno della libreria, la riga
in `brand_canvas_items` restava, `tiles` continuava a contenerla, e alla prima
riconciliazione `syncNodes` la riportava dentro. Una cancellazione a metà, locale
e muta — che è peggio di nessuna cancellazione, perché sembra funzionare per un
fotogramma.

Quindi due mosse insieme, e una sola non bastava: spegnere `deleteKey` della
libreria (`deleteKey={null}`) e far passare ⌫ dal nostro registro, che è già
l'unico posto in cui si decide quale tasto significa cosa.

## Cosa è stato collegato

- `CanvasFlow` espone `onDelete` e passa `ondelete` a `CanvasKeys`. Non tocca
  `nodes`: togliere il nodo dallo stato della libreria è esattamente il difetto.
- `ondelete` porta NODI E LINEE insieme, in una chiamata: ⌫ è un gesto solo e una
  selezione può tenere entrambi. `CanvasKeys` legge anche `getEdges`, che prima
  non guardava — ⌫ su una linea selezionata non faceva niente, ed era lo stesso
  difetto visto da un altro lato.
- La pagina toglie dal proprio stato (`gens`, `frames`, `places`, `edges`) e poi
  chiama `remove` / `disconnect`.
- `edges` passa da `$derived(data.edges)` a `$state`: una lista derivata dal server
  riporterebbe indietro la linea tolta al primo ricalcolo.

## L'eliminazione ottimista: sì

Si toglie subito e si rimette se il server rifiuta, con `failed` che lo dice. Il
motivo è il gesto: sulla tela si lavora a raffica, e un nodo che resta lì mezzo
secondo dopo ⌫ fa premere ⌫ una seconda volta. Il ripristino riporta indietro
anche `places`, perché una tile senza misure è una tile che non si disegna.

## `planDelete`, e perché è un modulo

Tre decisioni che non sono cablaggio e meritavano di essere provate senza browser:
quali id hanno davvero una riga dietro, quali archi cadono con loro, e quando non
c'è niente da chiedere al server. `undeletable` arriva da fuori invece di essere un
`if (id === 'recap')` scritto dentro: il modulo non sa cosa la tela stia mostrando,
e la seconda tile di arredo si aggiunge con un elemento in una lista.

Il recap è appunto l'unica tile senza `brand_canvas_items` dietro. ⌫ su di lui non
chiama niente e non fa lampeggiare nessun errore.

## Gli archi

`brand_canvas_edges` ha `on delete cascade` su `source_item_id`/`target_item_id`,
quindi il server è già a posto. Lo stato del client no: senza `plan.edgeIds` una
linea resterebbe disegnata verso un nodo che non esiste più fino al ricarico.

## Cosa NON è stato toccato

Una linea appena tirata non compare finché non si ricarica: `post` non fa
`invalidateAll` e `saveCanvasEdge` non restituisce l'id della riga, quindi la
pagina non può aggiungerla con l'id vero. È un difetto adiacente e reale, ma è
della creazione, non della cancellazione — e `invalidateAll` qui rifarebbe le ~30
query di `loadHomeOverview` per disegnare una linea.
