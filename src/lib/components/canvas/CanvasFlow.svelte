<script lang="ts">
  /**
   * LA TELA, SU SVELTEFLOW.
   *
   * La scelta è stata presa guardando due tele vere sugli stessi oggetti — una a mano e questa —
   * e ha vinto la libreria: selezione col riquadro, snap, minimappa, controlli di zoom e il
   * trascinamento già risolto sui casi limite (touch, penna, due dita) che a mano si scoprono uno
   * per uno in produzione.
   *
   * IL PREZZO, SCRITTO PERCHÉ NON SI DIMENTICHI: SvelteFlow tiene il PROPRIO stato dei nodi,
   * quindi la posizione di una tile esiste in due posti — qui e in `brand_canvas_items` — e vanno
   * tenute allineate a mano. È l'unico punto dove le due possono divergere, ed è l'`$effect` qui
   * sotto.
   *
   * GLI ARCHI ERANO SPENTI, e il commento qui diceva che una bacheca non è un grafo. Valeva finché
   * la tela aveva un lettore solo: adesso ne ha due, e per l'agente una linea è l'unico modo di
   * dire perché due cose stanno insieme — e di ritrovarlo al turno dopo. Restano spente le
   * connessioni MULTIPLE per attacco e la riconnessione al volo: non c'è ancora la domanda.
   *
   * E UNA LINEA SI CHIEDE IL PERMESSO PRIMA DI NASCERE. `isValidConnection` è il punto in cui la
   * libreria si ferma e domanda, ed è l'unico in cui si può ancora dire di no senza che l'utente
   * abbia già visto comparire qualcosa: rifiutare dopo vorrebbe dire far sparire una linea appena
   * disegnata, che si legge come un difetto e non come una risposta. La regola non sta qui — sta
   * in `connect-rules.ts`, sopra `graph.ts` — perché la stessa domanda la fanno anche l'attacco
   * che si colora e il menù dei versi, e tre copie diverrebbero diverse al primo caso nuovo.
   */
  import { untrack } from 'svelte';
  import { SvelteFlow, Background, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import CanvasTile from './CanvasTile.svelte';
  import CanvasPointer from './CanvasPointer.svelte';
  import CanvasAddBar from './CanvasAddBar.svelte';
  import CanvasKeys from './CanvasKeys.svelte';
  import CanvasSelectionBridge from './CanvasSelectionBridge.svelte';
  import SelectionToolbar from './SelectionToolbar.svelte';
  import ConnectPicker from './ConnectPicker.svelte';
  import CommonPropertiesPanel from './CommonPropertiesPanel.svelte';
  import type { SelectionActionId } from '$lib/canvas/selection-actions';
  import type { GenMedium, ModelChoice } from '$lib/canvas/gen-node';
  import { commonPropertiesOf } from '$lib/canvas/common-properties';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';
  import { CANVAS_DRAG_FILLED_NODE, parseFilledNodeDrag, type FilledNodeDrag } from '$lib/canvas/drag-payload';
  import { syncNodes } from '$lib/canvas/tile-sync';
  import { CANVAS_EDGE_KINDS, EDGE_KIND_LABEL, type CanvasEdgeKind, type FlowEdge } from '$lib/canvas-edges';
  import { isAddable, type Addable } from '$lib/canvas/addable';
  import { DEFAULT_EDGE_KIND, edgeKindsFor, verdictBetween } from '$lib/canvas/connect-rules';
  import { connectorAccepts } from '$lib/canvas/connector-ports';
  import { isListValued, type ConnectorType } from '$lib/canvas/connectors';
  import type { CanvasNode } from '$lib/canvas/graph';

  /**
   * Dove sta una tile e quanto è grande, in unità di tela — le stesse di `brand_canvas_items`.
   *
   * `connectable` è l'eccezione dichiarata dove si vede: non tutto quel che sta sulla tela produce
   * altro. Un post e un documento sì; un pannello che riassume il brand no, e due puntini sopra
   * sarebbero l'invito a un gesto che poi fallisce. Assente vale COLLEGABILE, perché il contenuto
   * è il caso normale e l'arredo è l'eccezione.
   *
   * `node` è COSA c'è dentro, nel vocabolario di `graph.ts`, e serve a una cosa sola: poter dire
   * di no a un arco mentre il puntatore è ancora in aria. Facoltativo perché non tutto quel che
   * sta sulla tela è un nodo del modello — il recap non lo è — e chi non lo dichiara non viene
   * rifiutato: non sapere abbastanza non è un motivo per impedire.
   */
  export type Tile = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    connectable?: boolean;
    node?: CanvasNode;
    /** Le porte di questo nodo (`connectorsFor`), passate a `CanvasTile` così com'è. Assente =
     *  un solo ingresso generico. */
    connectors?: ConnectorType[];
    output?: ConnectorType | null;
  };

  let {
    tiles = [],
    edges: incomingEdges = [],
    onMove,
    onMoveEnd,
    onConnect,
    onDelete,
    onEdgeDelete,
    onEdgeRetype,
    onCreate,
    onCreateFilled,
    onUpload,
    onDuplicate,
    onCopy,
    onPaste,
    onUndo,
    onRedo,
    onConnectNew,
    onConnectExisting,
    nodeSummaries = [],
    modelChoicesFor,
    onCommonChange,
    tile
  }: {
    tiles?: Tile[];
    /** Le linee già in `brand_canvas_edges`, pronte per il disegno. */
    edges?: FlowEdge[];
    /** Dove una tile è finita, per scriverlo dove vive davvero. */
    onMove?: (id: string, x: number, y: number) => void;
    /**
     * LA FINE DI UN TRASCINAMENTO, CON TUTTE LE TILE CHE SI SONO MOSSE — non una per chiamata
     * come `onMove`. Trascinare una selezione di cinque tile è UN gesto: annullarlo deve
     * riportarle tutte e cinque, non una alla volta con quattro Ctrl+Z. SvelteFlow lo sa già
     * (`onnodedragstop` porta `nodes`, il set intero, non solo `targetNode`); prima di questo
     * prop nessuno lo leggeva.
     */
    onMoveEnd?: (moves: { id: string; x: number; y: number }[]) => void;
    /**
     * Una linea appena tirata fra due tile, col verso già scelto: il primo che `edgeKindsFor`
     * propone su quella coppia. Un `kind` fisso qui sarebbe una derivazione salvata anche fra due
     * cose che non si derivano — cioè un dato falso scritto senza che nessuno l'abbia chiesto.
     */
    onConnect?: (sourceItemId: string, targetItemId: string, kind: CanvasEdgeKind) => void;
    /**
     * Le tile da togliere. Chiesto fuori e non fatto qui: SvelteFlow le toglierebbe dal proprio
     * stato e basta, e alla prima riconciliazione `syncNodes` le rimetterebbe dentro perché
     * `tiles` le contiene ancora — il difetto era esattamente il nodo che torna in scena.
     */
    onDelete?: (ids: string[]) => void;
    /** Una linea da togliere. Senza, il primo errore resta sulla tela per sempre. */
    onEdgeDelete?: (edgeId: string) => void;
    /** Il verso di una linea che c'è già: si corregge, non si rifà. */
    onEdgeRetype?: (edgeId: string, kind: CanvasEdgeKind) => void;
    /** Una tile nuova chiesta dalla barra o dal trascinamento, col punto già in unità di tela. */
    onCreate?: (what: Addable, at: { x: number; y: number }) => void;
    /**
     * Una tile che nasce già PIENA — trascinata dalla libreria degli asset o dai brand, non dal
     * click sulla barra. `onDrop` la prova PRIMA del fallback `onCreate`: un file che ha già
     * un `assetId` non deve mai diventare un nodo vuoto perché il ramo sbagliato ha guardato per
     * primo.
     */
    onCreateFilled?: (drag: FilledNodeDrag, at: { x: number; y: number }) => void;
    /** Un file scelto dalla barra: la tela non lo carica da sé, lo passa a chi la monta. */
    onUpload?: (file: File) => void;
    /** ⌘D: duplica la selezione, con gli id come SvelteFlow li conosce. */
    onDuplicate?: (ids: string[]) => void;
    /** ⌘C: copia la selezione negli appunti di chi monta la tela. */
    onCopy?: (ids: string[]) => void;
    /** ⌘V: incolla, al centro di quel che si sta guardando adesso. */
    onPaste?: (at: { x: number; y: number }) => void;
    /** ⌘Z: annulla l'ultimo gesto di questa scheda. */
    onUndo?: () => void;
    /** ⇧⌘Z: ripete l'ultimo gesto annullato. */
    onRedo?: () => void;
    /**
     * "Collega a nuovo…": la scelta del tipo la fa questo componente (`ConnectPicker`), il nodo e
     * i fili li fa chi monta la tela — la stessa divisione di `onCreate`, dove il PUNTO lo decide
     * `CanvasFlow` e la SCRITTURA la pagina. `at` è già in unità di tela, a destra della selezione.
     */
    onConnectNew?: (ids: string[], medium: GenMedium, at: { x: number; y: number }) => void;
    /** "Collega a…": gli id scelti e il nodo su cui si è cliccato per chiudere la modalità bersaglio. */
    onConnectExisting?: (ids: string[], targetId: string) => void;
    /** `type`/`data` di ogni tile — la forma grezza che `commonPropertiesOf` legge, non `Tile`. */
    nodeSummaries?: { id: string; type: string; data: Record<string, unknown> }[];
    /** I modelli offribili per un medium che genera, dal catalogo di chi monta la tela. */
    modelChoicesFor?: (type: 'text' | 'image' | 'video') => ModelChoice[];
    /** Il pannello delle proprietà comuni ha scritto: un campo, applicato a ogni nodo selezionato. */
    onCommonChange?: (ids: string[], patch: { model?: string | null; aspectRatio?: string }) => void;
    /** Cosa disegnare dentro una tile. La tela non sa cosa mostra: lo decide chi la usa. */
    tile: import('svelte').Snippet<[{ id: string; selected: boolean }]>;
  } = $props();

  // Un tipo di nodo solo: la tela non ha tipi di NODO, ha tipi di CONTENUTO, e quelli li decide
  // lo snippet di chi la usa.
  const nodeTypes = { tile: CanvasTile };

  // IL COSTO DELLA LIBRERIA, IN UNA RIGA. SvelteFlow tiene il proprio stato dei nodi, quindi la
  // posizione esiste in due posti: qui e in `brand_canvas_items`. Il compilatore lo dice da solo —
  // `state_referenced_locally`: questa copia cattura `tiles` una volta e poi vive per conto suo.
  //
  // Un `$derived` non risolve: rigenerando i nodi a ogni cambio di `tiles` si butterebbe via il
  // trascinamento in corso. La sincronizzazione va scritta a mano, ed è il prezzo fisso della
  // libreria — quando arriverà `brand_canvas_items`, è qui che le due posizioni si riconciliano.
  const toNode = (t: Tile): Node => ({
    id: t.id,
    position: { x: t.x, y: t.y },
    // `render` è lo snippet del chiamante: il nodo lo esegue senza sapere cosa disegni.
    data: { tile: t, id: t.id, render: tile, connectable: t.connectable !== false, connectors: t.connectors, output: t.output ?? null },
    type: 'tile',
    style: `width:${t.w}px;height:${t.h}px`
  });

  // svelte-ignore state_referenced_locally -- la cattura iniziale è voluta: da qui in poi i nodi
  // sono di SvelteFlow, e l'effetto sotto ci porta dentro solo le tile NUOVE. È il warning che
  // nomina il costo della libreria, non un difetto da togliere.
  let nodes = $state.raw<Node[]>(tiles.map(toNode));
  // svelte-ignore state_referenced_locally -- stessa cattura iniziale dei nodi, e stesso motivo:
  // da qui in poi gli archi sono di SvelteFlow, e l'effetto sotto ci porta dentro solo i NUOVI.
  let edges = $state.raw<FlowEdge[]>([...incomingEdges]);

  // Le tile che arrivano dal server entrano, quelle sparite escono, e quelle che l'utente sta
  // muovendo restano dove le ha lasciate — la riconciliazione sta in `syncNodes`, col suo test.
  $effect(() => {
    const incoming = tiles;
    // `untrack` sui nodi: l'effetto reagisce alle tile in arrivo, non alle proprie scritture —
    // senza, aggiungerne uno lo rimetterebbe subito in coda a se stesso.
    const next = syncNodes(untrack(() => nodes), incoming, toNode);
    if (next) nodes = next;
  });

  // Gli archi seguono la stessa riconciliazione dei nodi: entrano i nuovi, escono quelli tolti.
  $effect(() => {
    const next = syncNodes(untrack(() => edges), incomingEdges, (e) => e);
    if (next) edges = next;
  });

  /**
   * OGNI TILE TRASCINATA SI SALVA, non solo quella sotto il puntatore. `nodes` porta l'INTERA
   * selezione mossa insieme (SvelteFlow lo dà già); prima solo `targetNode` veniva scritto, e un
   * trascinamento di più tile perdeva la posizione di tutte le altre alla prossima apertura —
   * un difetto che `onMoveEnd`, sotto, avrebbe reso visibile comunque: annullare uno spostamento
   * che il server non ha mai salvato riporterebbe un nodo a un `before` che coincide col suo
   * `after`, cioè a niente.
   */
  function onNodeDragStop({ targetNode, nodes: dragged }: { targetNode: Node | null; nodes: Node[] }) {
    if (!targetNode) return;
    for (const n of dragged) {
      onMove?.(n.id, n.position.x, n.position.y);
    }
    onMoveEnd?.(dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })));
  }

  /**
   * COSA C'È DIETRO UNA TILE, per id. Una mappa e non una `find` nel corpo di `isValidConnection`:
   * quella funzione la libreria la chiama a ogni movimento del puntatore mentre si tira una linea,
   * e una scansione lineare per fotogramma su una tela piena è il modo per far arrancare il gesto
   * che dovrebbe sembrare il più diretto di tutti.
   */
  const nodeOf = $derived(new Map(tiles.filter((t) => t.node).map((t) => [t.id, t.node!])));

  const lookup = (id: string) => nodeOf.get(id) ?? null;

  /** Le porte tipizzate di una tile, per id — usate solo per rifiutare un secondo filo su un
   *  connettore a valore singolo già occupato: `connect-rules.ts` non conosce i connettori, la
   *  domanda "quale porta" è di questo file. */
  const connectorsOf = $derived(new Map(tiles.map((t) => [t.id, t.connectors])));

  /**
   * IL RIFIUTO, MENTRE IL PUNTATORE È ANCORA IN ARIA. La libreria si ferma qui e domanda: tornare
   * `false` significa che la linea non si aggancia e l'attacco non si accende, senza che nessuno
   * abbia visto comparire qualcosa da far poi sparire.
   *
   * IL MOTIVO SI TIENE, e non è un di più: una linea che semplicemente non si attacca si legge
   * come un difetto del mouse, e chi l'ha tirata riprova identico. `canConnect` il motivo ce
   * l'ha già scritto — buttarlo via qui sarebbe l'unico vero errore di tutto il collegamento.
   */
  let refusal = $state<string | null>(null);

  function isValidConnection(c: {
    source?: string | null;
    target?: string | null;
    targetHandle?: string | null;
  }): boolean {
    const { source, target, targetHandle } = c;
    if (!source || !target) return false;

    const verdict = verdictBetween(lookup, source, target);
    if (!verdict.ok) {
      refusal = verdict.why;
      return false;
    }

    const connector = targetHandle as ConnectorType | null | undefined;
    const connectors = connectorsOf.get(target);
    if (connector && connectors?.includes(connector)) {
      const portEdges = edges.map((e) => ({ id: e.id, target: e.target, targetHandle: e.targetHandle ?? null }));
      const free = connectorAccepts(portEdges, target, connector, isListValued(connector));
      if (!free) {
        refusal = `porta ${connector} già occupata`;
        return false;
      }
    }

    refusal = null;
    return true;
  }

  /**
   * Una linea appena tirata. NON si aggiunge qui agli archi: la si annuncia e basta, e comparirà
   * quando il server la restituisce con il suo id vero. Disegnarla subito con un id inventato
   * significherebbe averla due volte appena i dati tornano — la copia ottimista e quella vera.
   */
  function onConnected(connection: { source?: string | null; target?: string | null }) {
    const { source, target } = connection;
    if (!source || !target || source === target) return;

    refusal = null;
    onConnect?.(source, target, edgeKindsFor(lookup, source, target)[0] ?? DEFAULT_EDGE_KIND);
  }

  /**
   * IL PANNELLO DI UNA LINEA, al clic su di lei.
   *
   * Un arco è largo un paio di pixel: un menù al tasto destro sarebbe il gesto giusto per un
   * bersaglio grande, e su questo costringerebbe a centrarlo due volte. Il clic lo apre, un clic
   * altrove lo chiude, ed è il solo posto in cui un arco si cambia o si toglie.
   *
   * I VERSI PROPOSTI SONO QUELLI CHE HANNO SENSO su quella coppia, letti dallo stesso
   * `edgeKindsFor` che ha scelto il verso alla nascita: offrire «nasce da» fra due immagini
   * sarebbe far scegliere un arco che il modello rifiuta.
   */
  let picked = $state<{ edge: FlowEdge; screen: { x: number; y: number } } | null>(null);

  const pickedKinds = $derived(
    picked ? edgeKindsFor(lookup, picked.edge.source, picked.edge.target) : []
  );

  function onEdgeClick({ edge, event }: { edge: FlowEdge; event: MouseEvent | TouchEvent }) {
    const point = 'clientX' in event ? event : event.touches[0];
    if (!point) return;

    picked = { edge, screen: { x: point.clientX, y: point.clientY } };
  }

  function retype(kind: CanvasEdgeKind) {
    if (!picked) return;

    onEdgeRetype?.(picked.edge.id, kind);
    picked = null;
  }

  function drop() {
    if (!picked) return;

    onEdgeDelete?.(picked.edge.id);
    picked = null;
  }

  /**
   * ⌫ SULLA SELEZIONE, e i due tipi vanno a due porte diverse.
   *
   * Qui non si tocca `nodes`: togliere il nodo dallo stato della libreria e basta è esattamente il
   * difetto che si vedeva — la tile spariva per un attimo e tornava, perché la riga c'era ancora e
   * `syncNodes` la riportava dentro alla riconciliazione dopo. Sparisce quando `tiles` non la
   * contiene più, il che vuol dire quando chi ha la riga l'ha tolta.
   *
   * Il pannello di una linea si chiude: potrebbe essere aperto proprio su quella che sta cadendo,
   * e resterebbe a offrire versi per un arco che non c'è.
   */
  function dropSelection(chosen: { nodes: string[]; edges: string[] }) {
    picked = null;
    for (const id of chosen.edges) {
      onEdgeDelete?.(id);
    }
    if (chosen.nodes.length) onDelete?.(chosen.nodes);
  }

  /**
   * LA BARRA DELLA SELEZIONE. `CanvasSelectionBridge` vive dentro `SvelteFlow` e riporta qui id e
   * riquadro a ogni cambio — la barra stessa vive fuori, sotto, perché non ha bisogno del contesto
   * della libreria, solo di coordinate già pronte.
   */
  let selection = $state<{ ids: string[]; box: { x: number; y: number; width: number } | null }>({
    ids: [],
    box: null
  });

  /**
   * "COLLEGA A NUOVO…": apre `ConnectPicker` a destra del riquadro della selezione — lo stesso
   * `selection.box`, già in coordinate di schermo, che disegna la barra. La posizione del nodo
   * nuovo si converte in unità di tela solo alla scelta del tipo (`pickConnectMedium`): prima non
   * serve, e la selezione può muoversi mentre il menù è aperto.
   */
  let connectPickerAt = $state<{ x: number; y: number } | null>(null);

  /**
   * "COLLEGA A…": la tela entra in modalità bersaglio — il prossimo clic su UN nodo (non sullo
   * sfondo, non su uno già nella selezione) lo sceglie come destinazione e chiude la modalità.
   * `targeting` porta gli id della selezione che l'ha aperta: la barra può nel frattempo perdere
   * quella selezione (l'utente clicca altrove prima di scegliere) senza perdere QUALI nodi
   * andavano collegati.
   */
  let targeting = $state<string[] | null>(null);

  function onNodeClick({ node }: { node: Node }) {
    if (!targeting) return;
    if (targeting.includes(node.id)) return;

    onConnectExisting?.(targeting, node.id);
    targeting = null;
  }

  /**
   * COSA FA OGNI BOTTONE DELLA BARRA — una tabella, non un `if` per azione: la stessa idea di
   * `RUN` in `CanvasKeys.svelte`, qui perché lo stato della selezione (`selection.ids`) vive in
   * questo componente e non in quello.
   */
  const SELECTION_RUN: Record<SelectionActionId, (ids: string[]) => void> = {
    duplicate: (ids) => onDuplicate?.(ids),
    'connect-new': () => {
      if (!selection.box) return;
      connectPickerAt = { x: selection.box.x + selection.box.width + 24, y: selection.box.y };
    },
    'connect-existing': (ids) => {
      targeting = ids;
    },
    delete: (ids) => onDelete?.(ids)
  };

  function runSelectionAction(id: SelectionActionId) {
    if (!selection.ids.length) return;
    SELECTION_RUN[id](selection.ids);
  }

  /**
   * IL PANNELLO COMPARE DA DUE NODI IN SU: su uno solo `GenNode.svelte` mostra già le sue
   * proprietà addosso al nodo (vedi il commento lì), e un secondo pannello qui direbbe la stessa
   * cosa due volte in due posti diversi.
   */
  const commonSelection = $derived(nodeSummaries.filter((n) => selection.ids.includes(n.id)));
  const commonProperties = $derived(
    selection.ids.length > 1 ? commonPropertiesOf(commonSelection) : commonPropertiesOf([])
  );
  const commonChoices = $derived(
    commonProperties.type && modelChoicesFor ? modelChoicesFor(commonProperties.type) : []
  );

  function pickConnectMedium(medium: GenMedium) {
    if (!connectPickerAt || !toFlow) { connectPickerAt = null; return; }

    onConnectNew?.(selection.ids, medium, toFlow(connectPickerAt));
    connectPickerAt = null;
  }

  // La conversione schermo → tela arriva da `CanvasPointer` DOPO il mount — serve al trascinamento
  // (`onDrop`) e al clic sulla barra (`addAtCentre`). `$state` e non un `let` semplice: in una
  // variabile non reattiva chi la legge prima del mount vedrebbe il `null` di partenza per sempre.
  let toFlow = $state<((p: { x: number; y: number }) => { x: number; y: number }) | null>(null);

  /**
   * Qualcosa lasciato cadere sulla tela. `ondragover` con `preventDefault` non è cerimonia: senza,
   * il browser rifiuta il rilascio e il trascinamento finisce in un nulla di fatto.
   */
  function onDragOver(e: DragEvent) {
    const types = e.dataTransfer?.types ?? [];
    if (!types.includes(CANVAS_DRAG_FILLED_NODE) && !types.includes(CANVAS_DRAG_MEDIUM)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  }

  /**
   * IL PAYLOAD PIENO SI PROVA PER PRIMO. La stessa card trascinata porta ENTRAMBI i MIME
   * (`drag-payload.ts`, i pannelli che trascinano) — pieno come strada normale, vuoto come
   * fallback per chi non lo legge ancora. Guardare prima il fallback creerebbe un nodo vuoto e
   * scarterebbe in silenzio il file che l'utente aveva già pronto in mano.
   */
  function onDrop(e: DragEvent) {
    if (!toFlow) return;

    const filledRaw = e.dataTransfer?.getData(CANVAS_DRAG_FILLED_NODE);
    if (filledRaw) {
      const drag = parseFilledNodeDrag(filledRaw);
      if (drag) {
        e.preventDefault();
        onCreateFilled?.(drag, toFlow({ x: e.clientX, y: e.clientY }));
        return;
      }
    }

    const what = e.dataTransfer?.getData(CANVAS_DRAG_MEDIUM);
    if (!what || !isAddable(what)) return;

    e.preventDefault();
    onCreate?.(what, toFlow({ x: e.clientX, y: e.clientY }));
  }

  /** Il clic sulla barra: nessun punto scelto, quindi al centro di quel che si sta guardando. */
  function addAtCentre(what: Addable) {
    if (!toFlow) return;
    const box = wrap?.getBoundingClientRect();
    if (!box) return;

    onCreate?.(what, toFlow({ x: box.left + box.width / 2, y: box.top + box.height / 2 }));
  }

  let wrap = $state<HTMLDivElement | null>(null);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- il trascinamento è una scorciatoia sulla
     tela, non l'unico modo di creare un nodo: chi non trascina usa la barra o la tastiera. -->
<div
  class="wrap"
  bind:this={wrap}
  ondragover={onDragOver}
  ondrop={onDrop}
>
  <!--
    I gesti che ci si aspetta da una tela, e qui sono quattro flag: due dita spostano
    (`panOnScroll`), il pinch ingrandisce (`zoomOnPinch`), e la rotella nuda NON ingrandisce
    (`zoomOnScroll={false}`) — che sarebbe il difetto peggiore su un trackpad, la scala che salta
    mentre si scorre.

    Il quarto spegne lo zoom sul DOPPIO CLIC, che la libreria fa di default: un doppio clic sullo
    sfondo non ha più un gesto proprio qui, e lasciare lo zoom della libreria darebbe un salto di
    scala che nessuno ha chiesto.

    È il caso in cui la libreria guadagna: il comportamento si chiede, non si scrive.

    E IL QUINTO SPEGNE LA CANCELLAZIONE DELLA LIBRERIA, che è il difetto pagato: `deleteKey` vale
    'Backspace' di default, e il suo `KeyHandler` chiama `deleteElements` da sé. Il nodo spariva
    dal solo stato di SvelteFlow — la riga in `brand_canvas_items` restava, `tiles` continuava a
    contenerla, e alla riconciliazione dopo il nodo RIENTRAVA. Si vedeva come «⌫ non funziona»,
    ed era invece una cancellazione a metà, locale e muta. ⌫ resta uno: lo riconosce
    `shortcuts.ts` e lo esegue `CanvasKeys`, che passa da chi la riga ce l'ha davvero.
  -->
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    onnodedragstop={onNodeDragStop}
    onconnect={onConnected}
    onedgeclick={onEdgeClick}
    onnodeclick={onNodeClick}
    {isValidConnection}
    onconnectend={() => (refusal = null)}
    panOnScroll
    zoomOnPinch
    zoomOnScroll={false}
    zoomOnDoubleClick={false}
    deleteKey={null}
    fitView
  >
    <CanvasPointer onready={(fn) => (toFlow = fn)} />
    <CanvasKeys
      onadd={addAtCentre}
      onmove={onMove}
      ondelete={dropSelection}
      onduplicate={onDuplicate}
      oncopy={onCopy}
      onpaste={onPaste}
      onundo={onUndo}
      onredo={onRedo}
    />
    <CanvasSelectionBridge onchange={(next) => (selection = next)} />
    <Background gap={24} />
  </SvelteFlow>

  {#if refusal}
    <!-- `role="status"` e non `alert`: il lettore di schermo lo annuncia senza interrompere il
         gesto in corso, che è l'unico momento in cui questo messaggio serve. -->
    <p class="edge-refusal" role="status">{refusal}</p>
  {/if}

  {#if targeting}
    <p class="edge-refusal" role="status">Scegli il nodo a cui collegare — Esc per annullare</p>
  {/if}

  {#if onCreate}
    <CanvasAddBar onpick={addAtCentre} onupload={onUpload} />
  {/if}

  <SelectionToolbar box={selection.box} count={selection.ids.length} onaction={runSelectionAction} />

  <CommonPropertiesPanel
    box={selection.box}
    properties={commonProperties}
    choices={commonChoices}
    onchange={(patch) => onCommonChange?.(selection.ids, patch)}
  />

  {#if connectPickerAt}
    <ConnectPicker at={connectPickerAt} onpick={pickConnectMedium} onclose={() => (connectPickerAt = null)} />
  {/if}

  {#if picked && (onEdgeRetype || onEdgeDelete)}
    <div class="gen-menu-veil" role="presentation" onclick={() => (picked = null)}></div>
    <div
      class="edge-panel"
      role="menu"
      tabindex="-1"
      style={`left:${picked.screen.x}px; top:${picked.screen.y}px`}
    >
      {#if onEdgeRetype}
        {#each pickedKinds as kind (kind)}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={kind === picked.edge.kind}
            class:is-on={kind === picked.edge.kind}
            onclick={() => retype(kind)}
          >
            {EDGE_KIND_LABEL[kind]}
          </button>
        {/each}
      {/if}

      {#if onEdgeDelete}
        <button type="button" role="menuitem" class="edge-drop" onclick={drop}>Togli</button>
      {/if}
    </div>
  {/if}
</div>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    picked = null;
    refusal = null;
    connectPickerAt = null;
    targeting = null;
  }}
/>

<style>
  /*
   * IL TEMA PASSA DALLE VARIABILI DELLA LIBRERIA, non da regole che sovrascrivono le sue.
   *
   * SvelteFlow dichiara `--xy-*` per ogni superficie che disegna, e mapparle sui colori dell'app
   * è ciò che fa seguire alla tela anche il tema scuro, senza un secondo blocco `[data-theme]`
   * qui: i token dell'app cambiano già da soli, e questi li leggono. Combattere con `!important`
   * sulle classi interne darebbe lo stesso risultato oggi e si romperebbe al primo aggiornamento.
   */
  .wrap {
    /* La barra sta sopra la tela, ancorata a questo riquadro e non alla finestra: dentro il
       flusso scorrerebbe con la tela, fuori si scollerebbe quando il guscio cambia misura. */
    position: relative;
    width: 100%;
    height: 100%;

    --xy-background-color: var(--paper, #fff);
    --xy-background-pattern-color: var(--line-2, #d2d2d7);

    /* L'attribuzione resta — nasconderla è del piano Pro — quindi almeno si veste come il resto,
       invece di essere l'unico riquadro bianco su una tela scura. */
    --xy-attribution-background-color: color-mix(in srgb, var(--paper, #fff) 70%, transparent);

    --xy-edge-stroke: var(--ink-soft, #6e6e73);
    --xy-edge-stroke-selected: var(--accent, #7c5cff);
    --xy-edge-label-background-color: var(--paper, #fff);
    --xy-edge-label-color: var(--ink-soft, #6e6e73);
  }

  /* Il colore del link è scritto fisso nella libreria (`#999`), quindi non basta una variabile. */
  .wrap :global(.svelte-flow__attribution a) {
    color: var(--ink-soft, #6e6e73);
  }

  /* Lo sfondo cliccabile che chiude il pannello di una linea. `position: fixed` perché il punto
     che lo colloca è quello dello SCHERMO: dentro il flusso si muoverebbe con la tela mentre lo
     si guarda. */
  .gen-menu-veil {
    position: fixed;
    inset: 0;
    z-index: 20;
  }

  /* Il motivo del rifiuto, sotto lo sguardo di chi sta tirando la linea e non in un angolo:
     `pointer-events: none` perché compare a metà gesto, e un riquadro che intercetta il puntatore
     lo interromperebbe proprio mentre spiega perché non si può. */
  .edge-refusal {
    position: absolute;
    z-index: 12;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--ink, #1d1d1f);
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 999px;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.1);
    pointer-events: none;
  }

  /* SvelteFlow mette `.connectingto` sull'attacco sotto il puntatore e `.valid` solo quando
     `isValidConnection` ha detto di sì — i nomi delle classi stanno in `Handle.svelte` della
     libreria, non sono indovinati. La coppia senza `.valid` è ESATTAMENTE «qui non si può», e
     dirlo col colore è ciò che evita di far tirare una linea che poi non si aggancia e basta.

     Visibili sempre durante il gesto, non solo col puntatore sopra la tile: il verdetto serve
     mentre si cerca dove posare la linea, che è prima di essere arrivati. */
  .wrap :global(.svelte-flow__handle.connectingto) {
    opacity: 1;
  }
  .wrap :global(.svelte-flow__handle.connectingto:not(.valid)) {
    background: #c0392b;
    cursor: not-allowed;
  }
  .wrap :global(.svelte-flow__handle.connectingto.valid) {
    background: var(--accent, #7c5cff);
  }

  .edge-panel {
    position: fixed;
    z-index: 21;
    display: flex;
    flex-direction: column;
    min-width: 128px;
    padding: 4px;
    border-radius: 10px;
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
  }
  .edge-panel button {
    padding: 6px 10px;
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    color: var(--ink, #1d1d1f);
    background: none;
    border: none;
    border-radius: 7px;
    cursor: pointer;
  }
  .edge-panel button:hover,
  .edge-panel button:focus-visible {
    background: var(--paper-2, #f9f9f9);
  }
  .edge-panel button.is-on {
    color: var(--accent, #7c5cff);
  }
  .edge-panel button.edge-drop {
    margin-top: 3px;
    padding-top: 7px;
    border-top: 1px solid var(--line, #e5e5e5);
    border-radius: 0;
    color: #c0392b;
  }
</style>
