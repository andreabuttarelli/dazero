<script lang="ts">
  /**
   * LA BARRA CONTESTUALE DI UNA SELEZIONE.
   *
   * Compare quando c'è almeno un nodo selezionato, ancorata SOPRA il riquadro che li contiene
   * tutti — non sotto, dove finirebbe fra i nodi stessi su una tela affollata. `box` arriva già in
   * coordinate di SCHERMO da chi monta la tela (`useSvelteFlow` sa convertire, questo componente
   * no: non vive dentro `SvelteFlow`, e leggere il suo contesto da fuori tornerebbe `null`).
   *
   * LE AZIONI SONO UNA TABELLA (`selection-actions.ts`), non un bottone scritto per ognuna: un
   * bottone nuovo — "Crea post dalla selezione" — è una riga lì, non un `{#if}` qui.
   */
  import { SELECTION_ACTIONS, type SelectionActionId } from '$lib/canvas/selection-actions';
  import { SELECTION_ACTION_ICON } from '$lib/canvas/selection-action-icons';

  let {
    box,
    count,
    onaction
  }: {
    /** Il riquadro che contiene la selezione, in coordinate di schermo. Null = niente da mostrare. */
    box: { x: number; y: number; width: number } | null;
    /** Quante tile sono scelte — solo per l'etichetta, la barra non ne ha bisogno per altro. */
    count: number;
    onaction?: (id: SelectionActionId) => void;
  } = $props();
</script>

{#if box}
  <div class="toolbar" style={`left:${box.x + box.width / 2}px; top:${box.y}px`} role="toolbar" aria-label="Azioni sulla selezione">
    <span class="count">{count}</span>
    {#each SELECTION_ACTIONS as action (action.id)}
      {@const Icon = SELECTION_ACTION_ICON[action.id]}
      <button
        type="button"
        title={action.label}
        aria-label={action.label}
        onclick={() => onaction?.(action.id)}
      >
        <Icon size={15} strokeWidth={1.7} />
      </button>
    {/each}
  </div>
{/if}

<style>
  .toolbar {
    position: fixed;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 2px;
    transform: translate(-50%, calc(-100% - 10px));
    padding: 4px;
    border-radius: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    box-shadow: 0 4px 18px rgb(0 0 0 / 0.1);
  }

  .count {
    padding: 0 6px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft, #6e6e73);
    border-right: 1px solid var(--line, #e5e5e5);
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    font: inherit;
    color: var(--ink, #1d1d1f);
    background: none;
    border: none;
    border-radius: 0;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    background: var(--paper-2, #f9f9f9);
  }
</style>
