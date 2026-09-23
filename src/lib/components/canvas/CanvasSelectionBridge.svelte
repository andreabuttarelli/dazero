<script lang="ts">
  /**
   * COSA È SELEZIONATO ADESSO, E DOVE STA SULLO SCHERMO — per `SelectionToolbar`.
   *
   * Vive DENTRO `SvelteFlow` per lo stesso motivo di `CanvasPointer`/`CanvasKeys`: `useNodes` e
   * `flowToScreenPosition` leggono il contesto che solo `SvelteFlow` apre. La barra che disegna il
   * riquadro vive FUORI (`SelectionToolbar` non ha bisogno della libreria, solo di coordinate già
   * pronte), quindi questo componente è il ponte fra i due — non disegna niente, riporta su.
   *
   * IL RIQUADRO È QUELLO DELLA LIBRERIA (`getNodesBounds`), non ricalcolato a mano: la stessa
   * funzione che SvelteFlow usa per `fitView`, già corretta sui casi che un nodo senza `width`
   * misurato romperebbe.
   */
  import { useNodes, useSvelteFlow } from '@xyflow/svelte';

  let { onchange }: { onchange: (state: { ids: string[]; box: { x: number; y: number; width: number } | null }) => void } =
    $props();

  const nodesStore = useNodes();
  const { getNodesBounds, flowToScreenPosition } = useSvelteFlow();

  $effect(() => {
    const selected = nodesStore.current.filter((n) => n.selected);
    if (!selected.length) {
      onchange({ ids: [], box: null });
      return;
    }

    const bounds = getNodesBounds(selected);
    const topLeft = flowToScreenPosition({ x: bounds.x, y: bounds.y });
    const topRight = flowToScreenPosition({ x: bounds.x + bounds.width, y: bounds.y });

    onchange({
      ids: selected.map((n) => n.id),
      box: { x: topLeft.x, y: topLeft.y, width: topRight.x - topLeft.x }
    });
  });
</script>
