<script lang="ts">
  /**
   * "COLLEGA A NUOVO…": quale tipo di nodo deve nascere.
   *
   * Solo i tre che generano (`GEN_MEDIUMS`) — un `iframe` o un `doc` non ricevono archi in
   * ingresso (`graph.ts::CANVAS_NODE_SPECS`, `generated: false`), quindi non avrebbe senso
   * offrirli qui: un bottone che porterebbe sempre al rifiuto è peggio di un bottone assente.
   */
  import { GEN_MEDIUMS, type GenMedium } from '$lib/canvas/gen-node';
  import { ADDABLE_LABEL } from '$lib/canvas/addable';
  import { ADDABLE_ICON } from '$lib/canvas/addable-icons';

  let {
    at,
    onpick,
    onclose
  }: {
    at: { x: number; y: number };
    onpick: (medium: GenMedium) => void;
    onclose: () => void;
  } = $props();
</script>

<div class="veil" role="presentation" onclick={onclose}></div>
<div class="picker" role="menu" tabindex="-1" style={`left:${at.x}px; top:${at.y}px`}>
  {#each GEN_MEDIUMS as medium (medium)}
    {@const Icon = ADDABLE_ICON[medium]}
    <button type="button" role="menuitem" onclick={() => onpick(medium)}>
      <Icon size={15} strokeWidth={1.7} />
      {ADDABLE_LABEL[medium]}
    </button>
  {/each}
</div>

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 20;
  }
  .picker {
    position: fixed;
    z-index: 21;
    display: flex;
    flex-direction: column;
    min-width: 140px;
    padding: 4px;
    border-radius: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font: inherit;
    font-size: 12.5px;
    text-align: left;
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
