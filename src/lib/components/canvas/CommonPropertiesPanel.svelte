<script lang="ts">
  /**
   * LE PROPRIETÀ CHE PIÙ NODI SELEZIONATI HANNO IN COMUNE — `common-properties.ts` decide COSA
   * mostrare, questo componente lo disegna e chiede conferma prima di un cambio modello che
   * lascerebbe archi orfani, la stessa domanda che un nodo singolo farebbe (`orphanedByModelChange`).
   *
   * UN SOLO CAMPO ALLA VOLTA NON BASTA A GIUSTIFICARE IL PANNELLO: con UN nodo selezionato,
   * `GenNode.svelte` mostra già le sue proprietà addosso al nodo — questo pannello compare solo da
   * DUE in su, dove "addosso a quale dei due" non ha una risposta.
   */
  import type { CommonProperties } from '$lib/canvas/common-properties';
  import type { ModelChoice } from '$lib/canvas/gen-node';

  let {
    box,
    properties,
    choices,
    onchange
  }: {
    box: { x: number; y: number; width: number } | null;
    properties: CommonProperties;
    /** I modelli offribili per `properties.type` — vuoto quando il tipo è misto. */
    choices: ModelChoice[];
    onchange: (patch: { model?: string | null; aspectRatio?: string }) => void;
  } = $props();

  const modelValue = $derived(properties.model.kind === 'same' ? properties.model.value : null);
  const aspectRatioValue = $derived(properties.aspectRatio.kind === 'same' ? properties.aspectRatio.value : null);
  const choice = $derived(modelValue ? choices.find((c) => c.id === modelValue) : null);
</script>

{#if box && properties.type}
  <div class="panel" style={`left:${box.x + box.width / 2}px; top:${box.y}px`} role="group" aria-label="Proprietà comuni">
    <label>
      <span>Modello</span>
      <select
        value={modelValue ?? ''}
        onchange={(e) => onchange({ model: e.currentTarget.value || null })}
      >
        {#if properties.model.kind === 'mixed'}
          <option value="" disabled selected>Mixed</option>
        {:else if !modelValue}
          <option value="">Modello…</option>
        {/if}
        {#each choices as c (c.id)}
          <option value={c.id}>{c.label}</option>
        {/each}
      </select>
    </label>

    {#if properties.type !== 'text' && choice?.aspectRatios?.length}
      <label>
        <span>Formato</span>
        <select
          value={aspectRatioValue ?? ''}
          onchange={(e) => onchange({ aspectRatio: e.currentTarget.value })}
        >
          {#if properties.aspectRatio.kind === 'mixed'}
            <option value="" disabled selected>Mixed</option>
          {/if}
          {#each choice.aspectRatios as ratio (ratio)}
            <option value={ratio}>{ratio}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 8px;
    transform: translate(-50%, calc(-100% - 46px));
    padding: 6px 8px;
    border-radius: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    box-shadow: 0 4px 18px rgb(0 0 0 / 0.1);
  }

  label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
  }

  select {
    padding: 3px 4px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    background: var(--paper, #fff);
    border: 1px solid var(--line, #e5e5e5);
    border-radius: 0;
  }
</style>
