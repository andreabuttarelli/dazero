<script lang="ts">
  import Dices from '@lucide/svelte/icons/dices';
  import { controlFor, knobAngle, knobValueFromDrag, stepKnob } from '$lib/canvas/composition-editor';
  import type { LayoutParam } from '$lib/canvas/composition/types';

  const SEED_CEILING = 1_000_000;

  let {
    param,
    value,
    onchange
  }: {
    param: LayoutParam;
    value: unknown;
    onchange: (value: number | string) => void;
  } = $props();

  const control = $derived(controlFor(param, value));
  const angle = $derived(control.kind === 'slider' ? knobAngle(control.value, control.min, control.max) : 0);

  let dragging = $state(false);
  let dragX = 0;
  let dragY = 0;
  let dragValue = 0;

  function startDrag(event: PointerEvent) {
    if (control.kind !== 'slider') {
      return;
    }

    dragging = true;
    dragX = event.clientX;
    dragY = event.clientY;
    dragValue = control.value;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function drag(event: PointerEvent) {
    if (!dragging || control.kind !== 'slider') {
      return;
    }

    onchange(knobValueFromDrag(dragValue, event.clientX - dragX, event.clientY - dragY, control.min, control.max, control.step));
  }

  function stopDrag() {
    dragging = false;
  }

  function keydown(event: KeyboardEvent) {
    if (control.kind !== 'slider') {
      return;
    }

    const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight'
      ? 1
      : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
        ? -1
        : 0;
    if (direction === 0) {
      return;
    }

    onchange(stepKnob(control.value, direction, control.min, control.max, control.step));
    event.preventDefault();
  }

  function reroll() {
    onchange(Math.floor(Math.random() * SEED_CEILING));
  }
</script>

<label class:param-knob={control.kind === 'slider'} class="param">
  {#if control.kind === 'slider'}
    <span
      class:dragging
      class="knob"
      role="slider"
      tabindex="0"
      aria-label={param.label}
      aria-valuemin={control.min}
      aria-valuemax={control.max}
      aria-valuenow={control.value}
      style={`--knob-angle: ${angle}deg`}
      onpointerdown={startDrag}
      onpointermove={drag}
      onpointerup={stopDrag}
      onpointercancel={stopDrag}
      onlostpointercapture={stopDrag}
      onkeydown={keydown}
    >
      <span class="knob-indicator"><span class="knob-dot"></span></span>
      <span class="knob-value">{control.value}</span>
    </span>
    <span class="param-label">{param.label}</span>
  {:else if control.kind === 'select'}
    <span class="param-label">{param.label}</span>
    <select value={control.value} onchange={(e) => onchange(e.currentTarget.value)}>
      {#each control.options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {:else if control.kind === 'color'}
    <span class="param-label">{param.label}</span>
    <input type="color" value={control.value} oninput={(e) => onchange(e.currentTarget.value)} />
  {:else}
    <span class="param-label">{param.label}</span>
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

  .param-knob {
    align-items: center;
    min-width: 0;
    text-align: center;
  }

  .param:not(.param-knob) {
    grid-column: 1 / -1;
  }

  .param-label {
    color: var(--ink-soft, #6e6e73);
  }

  .knob {
    --knob-size: 54px;
    position: relative;
    display: grid;
    place-items: center;
    width: var(--knob-size);
    height: var(--knob-size);
    border: 1px solid var(--line, #dedede);
    border-radius: 50%;
    background: #27282c;
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
  }

  .knob:hover,
  .knob:focus-visible,
  .knob.dragging {
    outline: none;
    border-color: var(--ink-soft, #6e6e73);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ink, #1d1d1f) 10%, transparent);
  }

  .knob-indicator {
    position: absolute;
    inset: 5px;
    transform: rotate(var(--knob-angle));
  }

  .knob-dot {
    display: block;
    width: 5px;
    height: 5px;
    margin: 0 auto;
    border-radius: 50%;
    background: #fff;
  }

  .knob-value {
    color: #fff;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
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
