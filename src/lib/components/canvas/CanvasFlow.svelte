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
   */
  import { untrack } from 'svelte';
  import { SvelteFlow, Background, Controls, MiniMap, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import CanvasTile from './CanvasTile.svelte';
  import type { FlowEdge } from '$lib/canvas-edges';

  /**
   * Dove sta una tile e quanto è grande, in unità di tela — le stesse di `brand_canvas_items`.
   *
   * `connectable` è l'eccezione dichiarata dove si vede: non tutto quel che sta sulla tela produce
   * altro. Un post e un documento sì; un pannello che riassume il brand no, e due puntini sopra
   * sarebbero l'invito a un gesto che poi fallisce. Assente vale COLLEGABILE, perché il contenuto
   * è il caso normale e l'arredo è l'eccezione.
   */
  export type Tile = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    connectable?: boolean;
  };

  let {
    tiles = [],
    edges: incomingEdges = [],
    onMove,
    onConnect,
    tile
  }: {
    tiles?: Tile[];
    /** Le linee già in `brand_canvas_edges`, pronte per il disegno. */
    edges?: FlowEdge[];
    /** Dove una tile è finita, per scriverlo dove vive davvero. */
    onMove?: (id: string, x: number, y: number) => void;
    /** Una linea appena tirata fra due tile, perché chi usa la tela la salvi. */
    onConnect?: (sourceItemId: string, targetItemId: string) => void;
    /** Cosa disegnare dentro una tile. La tela non sa cosa mostra: lo decide chi la usa. */
    tile: import('svelte').Snippet<[{ id: string }]>;
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
    data: { tile: t, id: t.id, render: tile, connectable: t.connectable !== false },
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

  // Le tile che arrivano dal server entrano; quelle che l'utente sta muovendo restano dove le ha
  // lasciate. Senza questo confronto per id, ogni ricarica dei dati riporterebbe tutto indietro.
  $effect(() => {
    const incoming = tiles;
    // `untrack` sui nodi: l'effetto reagisce alle tile in arrivo, non alle proprie scritture —
    // senza, aggiungerne uno lo rimetterebbe subito in coda a se stesso.
    const known = new Set(untrack(() => nodes).map((n) => n.id));
    const added = incoming.filter((t) => !known.has(t.id)).map(toNode);
    if (added.length) nodes = [...untrack(() => nodes), ...added];
  });

  // Gli archi che arrivano dal server entrano; quelli appena tirati restano. Stesso confronto per
  // id dei nodi, e per la stessa ragione: senza, un ricarico dei dati cancellerebbe la linea che
  // l'utente ha appena disegnato e che il server non ha ancora restituito.
  $effect(() => {
    const incoming = incomingEdges;
    const known = new Set(untrack(() => edges).map((e) => e.id));
    const added = incoming.filter((e) => !known.has(e.id));
    if (added.length) edges = [...untrack(() => edges), ...added];
  });

  function onNodeDragStop({ targetNode }: { targetNode: Node | null }) {
    if (targetNode) onMove?.(targetNode.id, targetNode.position.x, targetNode.position.y);
  }

  /**
   * Una linea appena tirata. NON si aggiunge qui agli archi: la si annuncia e basta, e comparirà
   * quando il server la restituisce con il suo id vero. Disegnarla subito con un id inventato
   * significherebbe averla due volte appena i dati tornano — la copia ottimista e quella vera.
   */
  function onConnected(connection: { source?: string | null; target?: string | null }) {
    const { source, target } = connection;
    if (!source || !target || source === target) return;
    onConnect?.(source, target);
  }
</script>

<div class="wrap">
  <!--
    I gesti che ci si aspetta da una tela, e qui sono tre flag: due dita spostano (`panOnScroll`),
    il pinch ingrandisce (`zoomOnPinch`), e la rotella nuda NON ingrandisce (`zoomOnScroll={false}`)
    — che sarebbe il difetto peggiore su un trackpad, la scala che salta mentre si scorre.
    È il caso in cui la libreria guadagna: il comportamento si chiede, non si scrive.
  -->
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    onnodedragstop={onNodeDragStop}
    onconnect={onConnected}
    panOnScroll
    zoomOnPinch
    zoomOnScroll={false}
    fitView
  >
    <Background gap={24} />
    <Controls />
    <MiniMap />
  </SvelteFlow>
</div>

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
    width: 100%;
    height: 100%;

    --xy-background-color: var(--paper, #fff);
    --xy-background-pattern-color: var(--line-2, #d2d2d7);

    --xy-controls-button-background-color: var(--paper, #fff);
    --xy-controls-button-background-color-hover: var(--paper-2, #f9f9f9);
    --xy-controls-button-color: var(--ink, #1d1d1f);
    --xy-controls-button-color-hover: var(--ink, #1d1d1f);
    --xy-controls-button-border-color: var(--line-2, #d2d2d7);
    --xy-controls-box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);

    --xy-minimap-background-color: var(--paper, #fff);
    --xy-minimap-node-background-color: var(--line-2, #d2d2d7);
    --xy-minimap-node-stroke-color: var(--line, #e5e5e5);
    --xy-minimap-mask-background-color: color-mix(in srgb, var(--paper-2, #f9f9f9) 72%, transparent);
    --xy-minimap-mask-stroke-color: var(--line-2, #d2d2d7);

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

  /* La minimappa e i controlli restano riquadri dell'app: stesso bordo e stesso raggio del resto. */
  .wrap :global(.svelte-flow__minimap),
  .wrap :global(.svelte-flow__controls) {
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 10px;
    overflow: hidden;
  }
</style>
