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
   * sotto. Metà della superficie della libreria (archi, handle, connessioni) è per un grafo, che
   * questa bacheca non è: si lascia spenta.
   */
  import { untrack } from 'svelte';
  import { SvelteFlow, Background, Controls, MiniMap, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import CanvasTile from './CanvasTile.svelte';

  /** Dove sta una tile e quanto è grande, in unità di tela — le stesse di `brand_canvas_items`. */
  export type Tile = { id: string; x: number; y: number; w: number; h: number };

  let {
    tiles = [],
    onMove,
    tile
  }: {
    tiles?: Tile[];
    /** Dove una tile è finita, per scriverlo dove vive davvero. */
    onMove?: (id: string, x: number, y: number) => void;
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
    data: { tile: t, id: t.id, render: tile },
    type: 'tile',
    style: `width:${t.w}px;height:${t.h}px`
  });

  // svelte-ignore state_referenced_locally -- la cattura iniziale è voluta: da qui in poi i nodi
  // sono di SvelteFlow, e l'effetto sotto ci porta dentro solo le tile NUOVE. È il warning che
  // nomina il costo della libreria, non un difetto da togliere.
  let nodes = $state.raw<Node[]>(tiles.map(toNode));
  let edges = $state.raw([]);

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

  function onNodeDragStop({ targetNode }: { targetNode: Node | null }) {
    if (targetNode) onMove?.(targetNode.id, targetNode.position.x, targetNode.position.y);
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
  .wrap { width: 100%; height: 100%; }
</style>
