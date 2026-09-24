<script lang="ts">
  /**
   * UN NODO DELLA TELA, e nient'altro.
   *
   * SvelteFlow vuole un componente per tipo di nodo; questo è l'unico che serve, perché la tela non
   * ha tipi di nodo — ha tipi di CONTENUTO, e quello lo decide chi usa la tela passando uno
   * snippet. Qui dentro non c'è niente che sappia cosa sia un post o un documento: è la stessa
   * separazione per cui `brand_canvas_items` porta un riferimento e non una copia.
   *
   * DUE `Handle`, e per molto tempo non ce n'era nessuno: gli archi erano spenti perché la tela
   * era una bacheca. Adesso ha un secondo lettore, l'agente, e per lui una linea è l'unico modo di
   * dire che QUESTO nasce da QUELLO — quindi gli attacchi servono davvero.
   *
   * Due e non quattro: sinistra entra, destra esce. Quattro moltiplicherebbero per due i punti da
   * centrare col mouse senza aggiungere un significato, visto che il verso lo porta l'arco.
   * Restano invisibili finché non si passa sopra la tile, perché una bacheca ferma non deve
   * sembrare un diagramma.
   *
   * E NON SU TUTTE. Chi mette la tile dice se si collega: un post produce, un pannello che
   * riassume il brand no. Due puntini su quest'ultimo inviterebbero a un gesto che poi fallisce.
   */
  import { Handle, Position, useConnection, type NodeProps } from '@xyflow/svelte';
  import { CONNECTOR_STYLE, portActive, type ConnectorType, type DragOrigin } from '$lib/canvas/connectors';
  import { NODE_KIND_ICON, NODE_KIND_LABEL } from '$lib/canvas/node-label';
  import { isNodeType } from '$lib/canvas/node-data';
  import { getTileRender } from '$lib/canvas/tile-render-context';

  type TileData = {
    id: string;
    connectable?: boolean;
    /** Le porte di QUESTO nodo, dal modello scelto (`connectorsFor`). Assente = un solo ingresso
     *  generico — il caso di chi non ha ancora scelto un modello, o non produce affatto. */
    connectors?: ConnectorType[];
    output?: ConnectorType | null;
    /** `nodes.type`: decide icona e nome di riserva della targhetta fuori dal corpo. Assente su
     *  quel che non è un nodo del modello (il recap del brand) — niente targhetta in quel caso. */
    kind?: string;
    /** `nodes.display_name`, quando chi ha nominato il nodo l'ha scritto. Vince sul nome del tipo. */
    displayName?: string | null;
    /** Questo nodo è sorgente di almeno un post (`post_sources`). */
    inPost?: boolean;
  };

  // `selected` lo tiene SvelteFlow e lo passa a ogni nodo: è l'unico che sa davvero cosa è
  // selezionato, e una copia nostra divergerebbe al primo clic sullo sfondo. Passa allo snippet
  // perché è il contenuto a decidere cosa farne — un nodo che produce apre le sue proprietà, il
  // recap no.
  let { data, selected }: NodeProps = $props();
  const tile = $derived(data as unknown as TileData);
  const render = getTileRender();

  const connection = useConnection();
  const origin = $derived.by((): DragOrigin => {
    const c = connection.current;
    if (!c.inProgress || !c.fromHandle) {
      return null;
    }
    if (c.fromHandle.type === 'source') {
      const output = (c.fromNode?.data as TileData | undefined)?.output ?? null;
      return { side: 'source', type: output, nodeId: c.fromHandle.nodeId, handleId: c.fromHandle.id ?? null };
    }
    const port = c.fromHandle.id && c.fromHandle.id in CONNECTOR_STYLE ? (c.fromHandle.id as ConnectorType) : null;
    return { side: 'target', type: port, nodeId: c.fromHandle.nodeId, handleId: c.fromHandle.id ?? null };
  });

  const kind = $derived(tile.kind && isNodeType(tile.kind) ? tile.kind : null);
  const LabelIcon = $derived(kind ? NODE_KIND_ICON[kind] : null);
  const label = $derived(tile.displayName?.trim() || (kind ? NODE_KIND_LABEL[kind] : null));
</script>

{#if tile.connectable}
  {#if tile.connectors?.length}
    {#each tile.connectors as connector, i (connector)}
      <Handle
        type="target"
        id={connector}
        position={Position.Left}
        class={`typed-port port-in${portActive(origin, 'target', connector, { nodeId: tile.id, handleId: connector }) ? '' : ' port-off'}`}
        style={`top:${((i + 1) / (tile.connectors.length + 1)) * 100}%;--port:${CONNECTOR_STYLE[connector].color}`}
        title={CONNECTOR_STYLE[connector].label}
        aria-label={CONNECTOR_STYLE[connector].label}
      >
        <span class="port-name">{CONNECTOR_STYLE[connector].label}</span>
      </Handle>
    {/each}
  {:else}
    <Handle type="target" position={Position.Left} />
  {/if}
{/if}

{#if label && LabelIcon}
  <div class="node-label" class:is-chosen={selected}>
    <LabelIcon size={12} strokeWidth={1.8} />
    <span>{label}</span>
    {#if tile.inPost}
      <span class="in-post-marker" title="Usato in un post">●</span>
    {/if}
  </div>
{/if}

{@render render()({ id: tile.id, selected })}

{#if tile.connectable}
  {#if tile.output}
    <Handle
      type="source"
      position={Position.Right}
      class={`typed-port port-out${portActive(origin, 'source', tile.output, { nodeId: tile.id, handleId: null }) ? '' : ' port-off'}`}
      style={`--port:${CONNECTOR_STYLE[tile.output].color}`}
      title={CONNECTOR_STYLE[tile.output].label}
      aria-label={CONNECTOR_STYLE[tile.output].label}
    >
      <span class="port-name">{CONNECTOR_STYLE[tile.output].label}</span>
    </Handle>
  {:else}
    <Handle type="source" position={Position.Right} />
  {/if}
{/if}

<style>
  :global(.svelte-flow__handle) {
    width: 9px;
    height: 9px;
    border: 2px solid var(--paper, #fff);
    border-radius: 0;
    background: var(--ink-soft, #6e6e73);
    opacity: 0;
    transition: opacity 120ms ease;
  }
  :global(.svelte-flow__node:hover .svelte-flow__handle),
  :global(.svelte-flow__handle:focus-visible),
  :global(.svelte-flow__handle.connecting) {
    opacity: 1;
  }
  :global(.svelte-flow__handle.typed-port) {
    display: flex;
    align-items: center;
    gap: 6px;
    width: auto;
    height: 22px;
    min-width: 0;
    padding: 0 8px;
    border: 2px solid var(--port);
    background: var(--paper, #fff);
    opacity: 1;
    cursor: crosshair;
    transition: opacity 120ms ease;
  }
  :global(.svelte-flow__handle.typed-port::before) {
    content: '';
    flex: none;
    width: 10px;
    height: 10px;
    background: var(--port);
  }
  :global(.svelte-flow__handle.port-in) {
    left: 0;
    flex-direction: row-reverse;
    transform: translate(-100%, -50%);
  }
  :global(.svelte-flow__handle.port-out) {
    right: 0;
    transform: translate(100%, -50%);
  }
  :global(.svelte-flow__handle.port-off) {
    opacity: 0.12;
    pointer-events: none;
  }
  :global(.svelte-flow__handle.port-off .port-name) {
    display: none;
  }
  .port-name {
    font-size: 11px;
    line-height: 1;
    font-weight: 600;
    white-space: nowrap;
    color: var(--port);
    pointer-events: none;
  }

  /*
   * LA TARGHETTA, FUORI DAL CORPO DEL NODO — come il nome di un frame in Figma.
   *
   * `bottom: 100%` e non `top` negativo: ancora il basso della targhetta al TOP del nodo, quindi
   * cresce verso l'alto e non si sposta se il testo va a capo diversamente. Il piccolo margine
   * (`margin-bottom`) è lo spazio fra targhetta e corpo, non un padding del corpo — il nodo non sa
   * di avere una targhetta sopra.
   *
   * NESSUN `pointer-events: none`: trascinare la targhetta deve spostare il nodo, come un titolo
   * di frame — è la stessa superficie di trascinamento del nodo, non un bersaglio a parte. Non
   * intercetta un arco perché non è un `Handle`: SvelteFlow apre una connessione solo da lì.
   */
  .node-label {
    position: absolute;
    z-index: 3;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 2px 0;
    font-size: 11px;
    line-height: 1.3;
    color: var(--ink-soft, #6e6e73);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .node-label :global(svg) {
    flex: none;
  }
  .node-label span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .in-post-marker {
    flex: none;
    font-size: 8px;
    line-height: 1;
    color: var(--accent, #2563eb);
  }
  .node-label.is-chosen {
    color: var(--ink, #1d1d1f);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.svelte-flow__handle) {
      transition: none;
    }
  }
</style>
