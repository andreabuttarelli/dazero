<script lang="ts">
  /**
   * LA TASTIERA DELLA TELA.
   *
   * Vive DENTRO `SvelteFlow` per la stessa ragione di `CanvasPointer`: `useSvelteFlow` legge il
   * contesto che solo lui apre, e montato fuori questo componente si compila, non esplode e non
   * fa niente — zoom e inquadratura cadrebbero nel vuoto, in silenzio.
   *
   * QUALE TASTO FA COSA NON STA QUI: sta in `$lib/canvas/shortcuts.ts`, col suo test. Qui si
   * ESEGUE, ed è la stessa divisione del registro globale del prodotto — così la scheda che
   * elenca le scorciatoie è generata dalla lista che i tasti usano davvero, e non può mentire.
   *
   * `preventDefault` SOLO DOPO che il registro ha riconosciuto qualcosa. Chiamato prima
   * mangerebbe il Backspace di chi sta scrivendo dentro il prompt di un nodo, che è il difetto
   * peggiore che questa tela possa avere.
   *
   * Non disegna niente: è una presa di corrente, come `CanvasPointer`.
   */
  import { useSvelteFlow, type Node } from '@xyflow/svelte';
  import { matchCanvasShortcut, preventable, type CanvasCommand } from '$lib/canvas/shortcuts';
  import type { Addable } from '$lib/canvas/addable';

  let {
    onadd,
    ondelete,
    onmove,
    onduplicate,
    oncopy,
    onpaste,
    onundo,
    onredo
  }: {
    /** Aggiungi una tile del tipo chiesto, dove chi monta la tela decide. */
    onadd?: (what: Addable) => void;
    /**
     * Togli questa selezione. Prop e non azione locale: la riga nel database la conosce chi monta
     * la tela, e cancellare solo il nodo disegnato lo farebbe tornare alla prossima apertura.
     *
     * TILE E LINEE INSIEME, in una chiamata sola: ⌫ è un gesto solo, e una selezione può tenere
     * entrambe. Due prop separate costringerebbero chi ascolta a ricomporre quel che il gesto
     * aveva già unito — e a sbagliare l'ordine, che qui conta: le linee cadono con le tile.
     */
    ondelete?: (picked: { nodes: string[]; edges: string[] }) => void;
    /** Dove una tile è finita, con lo stesso contratto del trascinamento. */
    onmove?: (id: string, x: number, y: number) => void;
    /** ⌘D: duplica la selezione, con gli id come SvelteFlow li conosce. */
    onduplicate?: (ids: string[]) => void;
    /** ⌘C: copia la selezione negli appunti di chi monta la tela. */
    oncopy?: (ids: string[]) => void;
    /** ⌘V: incolla, al centro di quel che si sta guardando. */
    onpaste?: (at: { x: number; y: number }) => void;
    /** ⌘Z: annulla l'ultimo gesto di QUESTA scheda. */
    onundo?: () => void;
    /** ⇧⌘Z: ripete l'ultimo gesto annullato. */
    onredo?: () => void;
  } = $props();

  const { fitView, zoomIn, zoomOut, getNodes, getEdges, updateNode, screenToFlowPosition } = useSvelteFlow();

  const selected = (): Node[] => getNodes().filter((n) => n.selected);

  const selectedEdges = (): string[] =>
    getEdges()
      .filter((e) => e.selected)
      .map((e) => e.id);

  function setSelection(on: boolean) {
    for (const n of getNodes()) {
      updateNode(n.id, { selected: on });
    }
  }

  function nudge(dx: number, dy: number) {
    for (const n of selected()) {
      const next = { x: n.position.x + dx, y: n.position.y + dy };
      updateNode(n.id, { position: next });
      onmove?.(n.id, next.x, next.y);
    }
  }

  /**
   * L'eccezione dichiarata dove si vede, invece che sparsa in cinque `if`: una riga per comando,
   * e il prossimo comando si aggiunge con una riga. Il registro decide QUALE; questa tabella
   * decide COME, e le due liste stanno una accanto all'altra.
   */
  /** Il centro di quel che si sta guardando ADESSO, in unità di tela: dove un ⌘V senza puntatore
   *  atterra. `innerWidth/innerHeight` bastano — è un centro approssimato, non un punto esatto
   *  chiesto dall'utente, come lo è `addAtCentre` per la barra. */
  function screenCentre(): { x: number; y: number } {
    return screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }

  const RUN: Record<CanvasCommand['id'], (c: CanvasCommand) => void> = {
    add: (c) => c.id === 'add' && onadd?.(c.what),
    nudge: (c) => c.id === 'nudge' && nudge(c.dx, c.dy),
    delete: () => {
      const nodes = selected().map((n) => n.id);
      const edges = selectedEdges();
      if (nodes.length || edges.length) ondelete?.({ nodes, edges });
    },
    deselect: () => setSelection(false),
    'select-all': () => setSelection(true),
    fit: () => void fitView(),
    'zoom-in': () => zoomIn(),
    'zoom-out': () => zoomOut(),
    duplicate: () => {
      const ids = selected().map((n) => n.id);
      if (ids.length) onduplicate?.(ids);
    },
    copy: () => {
      const ids = selected().map((n) => n.id);
      if (ids.length) oncopy?.(ids);
    },
    paste: () => onpaste?.(screenCentre()),
    undo: () => onundo?.(),
    redo: () => onredo?.()
  };

  function onKeydown(e: KeyboardEvent) {
    const command = matchCanvasShortcut(e);
    if (!command) return;

    if (preventable(command)) e.preventDefault();
    RUN[command.id](command);
  }
</script>

<svelte:window onkeydown={onKeydown} />
