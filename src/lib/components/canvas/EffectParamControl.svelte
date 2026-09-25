<script lang="ts">
  import Dices from '@lucide/svelte/icons/dices';
  import { controlFor } from '$lib/canvas/effects/editor';
  import type { EffectParam } from '$lib/canvas/effects';

  const SEED_CEILING = 1_000_000;

  let {
    param,
    value,
    onchange
  }: {
    param: EffectParam;
    value: unknown;
    onchange: (value: number | string) => void;
  } = $props();

  const control = $derived(controlFor(param, value));

  function reroll() {
    onchange(Math.floor(Math.random() * SEED_CEILING));
  }
</script>

<label class="param">
  <span class="param-label">
    {param.label}
    {#if control.kind === 'slider'}
      <span class="param-value">{control.value}</span>
    {/if}
  </span>

  {#if control.kind === 'slider'}
    <input
      type="range"
      min={control.min}
      max={control.max}
      step={control.step}
      value={control.value}
      oninput={(e) => onchange(Number(e.currentTarget.value))}
    />
  {:else if control.kind === 'select'}
    <select value={control.value} onchange={(e) => onchange(e.currentTarget.value)}>
      {#each control.options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {:else if control.kind === 'color'}
    <input type="color" value={control.value} oninput={(e) => onchange(e.currentTarget.value)} />
  {:else}
    <span class="param-seed">
      <input type="number" value={control.value} onchange={(e) => onchange(Number(e.currentTarget.value))} />
      <button type="button" class="param-reroll" aria-label="Nuovo seed" onclick={reroll}>
        <Dices size={14} strokeWidth={1.75} />
      </button>
    </span>
  {/if}
</label>

<style>
  .param {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--ink, #1d1d1f);
  }

  .param-label {
    display: flex;
    justify-content: space-between;
    color: var(--ink-soft, #6e6e73);
  }

  .param-value {
    font-variant-numeric: tabular-nums;
  }

  .param input[type='range'] {
    width: 100%;
  }

  .param select,
  .param input[type='number'] {
    font: inherit;
    padding: 3px 6px;
    border: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }

  .param input[type='color'] {
    width: 48px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--line, #e5e5e5);
  }

  .param-seed {
    display: flex;
    gap: 4px;
  }
  .param-seed input {
    flex: 1;
    min-width: 0;
  }

  .param-reroll {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    border: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
    cursor: pointer;
  }
</style>
