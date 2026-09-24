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

  type TileData = {
    render?: import('svelte').Snippet<[{ id: string; selected: boolean }]>;
    id: string;
    connectable?: boolean;
    /** Le porte di QUESTO nodo, dal modello scelto (`connectorsFor`). Assente = un solo ingresso
     *  generico — il caso di chi non ha ancora scelto un modello, o non produce affatto. */
    connectors?: ConnectorType[];
    output?: ConnectorType | null;
  };

  // `selected` lo tiene SvelteFlow e lo passa a ogni nodo: è l'unico che sa davvero cosa è
  // selezionato, e una copia nostra divergerebbe al primo clic sullo sfondo. Passa allo snippet
  // perché è il contenuto a decidere cosa farne — un nodo che produce apre le sue proprietà, il
  // recap no.
  let { data, selected }: NodeProps = $props();
  const tile = $derived(data as unknown as TileData);

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

{#if tile.render}
  {@render tile.render({ id: tile.id, selected })}
{/if}

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
  @media (prefers-reduced-motion: reduce) {
    :global(.svelte-flow__handle) {
      transition: none;
    }
  }
</style>
