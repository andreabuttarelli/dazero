<script lang="ts">
  /**
   * UN NODO DELLA TELA, e nient'altro.
   *
   * SvelteFlow vuole un componente per tipo di nodo; questo è l'unico che serve, perché la tela non
   * ha tipi di nodo — ha tipi di CONTENUTO, e quello lo decide chi usa la tela passando uno
   * snippet. Qui dentro non c'è niente che sappia cosa sia un post o un documento: è la stessa
   * separazione per cui `brand_canvas_items` porta un riferimento e non una copia.
   *
   * NESSUN `Handle`: gli handle sono gli attacchi da cui partono gli archi di un grafo, e questa
   * bacheca non ne ha. Lasciarli metterebbe quattro puntini su ogni tile per una funzione che non
   * esiste.
   */
  import type { NodeProps } from '@xyflow/svelte';

  type TileData = { render?: import('svelte').Snippet<[{ id: string }]>; id: string };

  let { data }: NodeProps = $props();
  const tile = $derived(data as unknown as TileData);
</script>

{#if tile.render}
  {@render tile.render({ id: tile.id })}
{/if}
