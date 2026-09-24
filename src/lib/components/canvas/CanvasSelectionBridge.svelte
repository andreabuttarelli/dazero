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
   *
   * `LABEL_CLEARANCE_FLOW` alza il tetto del riquadro PRIMA di proiettarlo sullo schermo — in
   * unità di tela, non di schermo. La targhetta fuori dal corpo (`CanvasTile.svelte`) vive
   * DENTRO il viewport che SvelteFlow scala con lo zoom, quindi la sua altezza sullo schermo
   * cresce con lo zoom; un margine fisso in pixel di schermo (quello che `SelectionToolbar`
   * applicava da sé) resterebbe costante e a zoom alto la barra ci finirebbe sopra. Un margine in
   * unità di tela, proiettato con lo stesso `flowToScreenPosition`, cresce insieme alla targhetta.
   */
  import { useNodes, useSvelteFlow } from '@xyflow/svelte';

  const LABEL_CLEARANCE_FLOW = 24;

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
    const topLeft = flowToScreenPosition({ x: bounds.x, y: bounds.y - LABEL_CLEARANCE_FLOW });
    const topRight = flowToScreenPosition({ x: bounds.x + bounds.width, y: bounds.y - LABEL_CLEARANCE_FLOW });

    onchange({
      ids: selected.map((n) => n.id),
      box: { x: topLeft.x, y: topLeft.y, width: topRight.x - topLeft.x }
    });
  });
</script>
