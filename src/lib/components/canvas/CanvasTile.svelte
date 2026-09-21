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
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';

  type TileData = {
    render?: import('svelte').Snippet<[{ id: string }]>;
    id: string;
    connectable?: boolean;
  };

  let { data }: NodeProps = $props();
  const tile = $derived(data as unknown as TileData);
</script>

{#if tile.connectable}
  <Handle type="target" position={Position.Left} />
{/if}

{#if tile.render}
  {@render tile.render({ id: tile.id })}
{/if}

{#if tile.connectable}
  <Handle type="source" position={Position.Right} />
{/if}

<style>
  /* Gli attacchi si vedono quando servono: fermi sono un puntino, col puntatore sopra la tile
     diventano un bersaglio. `:global` perché il nodo è disegnato da SvelteFlow, non da qui. */
  :global(.svelte-flow__handle) {
    width: 9px;
    height: 9px;
    border: 2px solid var(--paper, #fff);
    background: var(--ink-soft, #6e6e73);
    opacity: 0;
    transition: opacity 120ms ease;
  }
  :global(.svelte-flow__node:hover .svelte-flow__handle),
  :global(.svelte-flow__handle:focus-visible),
  :global(.svelte-flow__handle.connecting) {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.svelte-flow__handle) {
      transition: none;
    }
  }
</style>
