<script lang="ts">
  /**
   * DOVE È STATO CLICCATO, IN UNITÀ DI TELA.
   *
   * Esiste come componente per una ragione sola: `useSvelteFlow` legge il contesto che `SvelteFlow`
   * apre, quindi funziona solo da DENTRO. Nel componente che lo monta il contesto non c'è ancora,
   * e la conversione tornerebbe coordinate dello schermo travestite da coordinate di tela — cioè
   * un nodo che compare lontano da dove è stato chiesto, tanto più lontano quanto più si è
   * scorsa la tela.
   *
   * Non disegna niente: è una presa di corrente.
   */
  import { useSvelteFlow } from '@xyflow/svelte';

  let { onready }: { onready: (toFlow: (p: { x: number; y: number }) => { x: number; y: number }) => void } =
    $props();

  const { screenToFlowPosition } = useSvelteFlow();

  onready((p) => screenToFlowPosition(p));
</script>
