<script lang="ts">
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';
  import { applyStack, EFFECTS, type EffectId, type EffectStep, type Pixels } from '$lib/canvas/effects';
  import { addStep, fitWithin, moveStep, removeStep, setParam, toggleStep } from '$lib/canvas/effects/editor';
  import EffectParamControl from './EffectParamControl.svelte';

  const PREVIEW_MAX_SIDE = 900;
  const PREVIEW_DEBOUNCE_MS = 80;
  const UNSAVED_PROMPT = 'Chiudere senza applicare? Le modifiche alla pila andranno perse.';

  type View = 'after' | 'before';

  let {
    initialSteps,
    inputUrl,
    onapply,
    onclose
  }: {
    initialSteps: EffectStep[];
    inputUrl: string | null;
    onapply: (steps: EffectStep[], output: Blob) => Promise<boolean>;
    onclose: () => void;
  } = $props();

  let steps = $state<EffectStep[]>(structuredClone($state.snapshot(initialSteps)) as EffectStep[]);
  let view = $state<View>('after');
  let busy = $state(false);
  let loadError = $state<string | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let bitmap = $state.raw<ImageBitmap | null>(null);
  let preview: Pixels | null = null;

  const effectIds = Object.keys(EFFECTS) as EffectId[];
  const dirty = $derived(JSON.stringify(steps) !== JSON.stringify(initialSteps));

  async function loadBitmap(url: string): Promise<ImageBitmap> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`immagine non disponibile (${res.status})`);
    }
    return createImageBitmap(await res.blob());
  }

  function pixelsOf(source: ImageBitmap, size: { width: number; height: number }): Pixels {
    const scratch = document.createElement('canvas');
    scratch.width = size.width;
    scratch.height = size.height;
    const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, size.width, size.height);
    const image = ctx.getImageData(0, 0, size.width, size.height);
    return { width: image.width, height: image.height, data: image.data };
  }

  function draw(target: HTMLCanvasElement, pixels: Pixels) {
    target.width = pixels.width;
    target.height = pixels.height;
    target.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  }

  function copyOf(pixels: Pixels): Pixels {
    return { width: pixels.width, height: pixels.height, data: new Uint8ClampedArray(pixels.data) };
  }

  $effect(() => {
    if (!inputUrl) {
      loadError = 'Collega un’immagine al nodo per vedere l’anteprima';
      return;
    }

    let cancelled = false;
    loadBitmap(inputUrl)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        bitmap = loaded;
        preview = pixelsOf(loaded, fitWithin(loaded.width, loaded.height, PREVIEW_MAX_SIDE));
        redraw();
      })
      .catch((cause: unknown) => {
        loadError = cause instanceof Error ? cause.message : 'immagine non leggibile';
      });

    return () => {
      cancelled = true;
    };
  });

  function redraw() {
    if (!canvas || !preview) {
      return;
    }
    draw(canvas, view === 'before' ? preview : applyStack(copyOf(preview), $state.snapshot(steps) as EffectStep[]));
  }

  $effect(() => {
    JSON.stringify(steps);
    void view;

    let frame = 0;
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(redraw);
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  });

  function close() {
    if (busy) {
      return;
    }
    if (dirty && !confirm(UNSAVED_PROMPT)) {
      return;
    }
    onclose();
  }

  function outputBlob(pixels: Pixels): Promise<Blob | null> {
    const full = document.createElement('canvas');
    draw(full, pixels);
    return new Promise((resolve) => full.toBlob(resolve, 'image/png'));
  }

  async function apply() {
    if (!bitmap || busy) {
      return;
    }

    busy = true;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const current = $state.snapshot(steps) as EffectStep[];
      const output = await outputBlob(applyStack(pixelsOf(bitmap, bitmap), current));
      if (!output) {
        loadError = 'impossibile esportare l’immagine';
        return;
      }
      if (await onapply(current, output)) {
        onclose();
      }
    } finally {
      busy = false;
    }
  }

  function add(event: Event & { currentTarget: HTMLSelectElement }) {
    const id = event.currentTarget.value as EffectId;
    event.currentTarget.value = '';
    if (id) {
      steps = addStep(steps, id);
    }
  }

  function onkeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      close();
    }
  }
</script>

<div class="fx-backdrop" role="presentation" onclick={close}></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="fx-editor" role="dialog" aria-label="Editor effetti" tabindex="-1" {onkeydown}>
  <header class="fx-head">
    <h2>Effetti</h2>
    <button type="button" class="fx-icon" aria-label="Chiudi" onclick={close}><X size={16} /></button>
  </header>

  <div class="fx-body">
    <div class="fx-preview">
      {#if loadError}
        <p class="fx-note">{loadError}</p>
      {/if}
      <canvas bind:this={canvas} class="fx-canvas" data-testid="effects-preview"></canvas>
      <div class="fx-toggle" role="group" aria-label="Confronto">
        <button type="button" class:is-on={view === 'before'} onclick={() => (view = 'before')}>Prima</button>
        <button type="button" class:is-on={view === 'after'} onclick={() => (view = 'after')}>Dopo</button>
      </div>
    </div>

    <aside class="fx-side">
      <select class="fx-add" aria-label="Aggiungi effetto" onchange={add}>
        <option value="">+ Aggiungi effetto</option>
        {#each effectIds as id (id)}
          <option value={id}>{EFFECTS[id].label}</option>
        {/each}
      </select>

      <ol class="fx-stack">
        {#each steps as step, index (index)}
          <li class="fx-step" class:is-off={!step.enabled} data-effect={step.id}>
            <div class="fx-step-head">
              <span class="fx-step-name">{EFFECTS[step.id].label}</span>
              <button type="button" class="fx-icon" aria-label="Sposta su" disabled={index === 0} onclick={() => (steps = moveStep(steps, index, 'up'))}><ArrowUp size={14} /></button>
              <button type="button" class="fx-icon" aria-label="Sposta giù" disabled={index === steps.length - 1} onclick={() => (steps = moveStep(steps, index, 'down'))}><ArrowDown size={14} /></button>
              <button type="button" class="fx-icon" aria-label={step.enabled ? 'Disattiva' : 'Attiva'} onclick={() => (steps = toggleStep(steps, index))}>
                {#if step.enabled}<Eye size={14} />{:else}<EyeOff size={14} />{/if}
              </button>
              <button type="button" class="fx-icon" aria-label="Rimuovi" onclick={() => (steps = removeStep(steps, index))}><Trash2 size={14} /></button>
            </div>
            {#each EFFECTS[step.id].params as param (param.name)}
              <EffectParamControl
                {param}
                value={step.params[param.name]}
                onchange={(value) => (steps = setParam(steps, index, param.name, value))}
              />
            {/each}
          </li>
        {:else}
          <li class="fx-note">Nessun effetto: aggiungine uno dal menu.</li>
        {/each}
      </ol>

      <footer class="fx-foot">
        <button type="button" class="fx-button" onclick={close} disabled={busy}>Annulla</button>
        <button type="button" class="fx-button is-primary" onclick={apply} disabled={busy || !bitmap}>
          {#if busy}<LoaderCircle size={14} class="fx-spin" />{/if}
          Applica
        </button>
      </footer>
    </aside>
  </div>
</section>

<style>
  .fx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgb(0 0 0 / 0.12);
  }

  .fx-editor {
    position: fixed;
    top: 44px;
    left: 60px;
    right: 16px;
    bottom: 16px;
    z-index: 61;
    display: flex;
    flex-direction: column;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #ededef);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  }

  @media (max-width: 480px) {
    .fx-editor {
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }
    .fx-body {
      flex-direction: column;
    }
    .fx-side {
      flex-basis: auto;
      border-left: 0;
      border-top: 1px solid var(--line, #ededef);
    }
  }

  .fx-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line, #ededef);
  }
  .fx-head h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .fx-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .fx-preview {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--paper-2, #f9f9f9);
  }

  .fx-canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .fx-toggle {
    position: absolute;
    left: 50%;
    bottom: 12px;
    display: flex;
    transform: translateX(-50%);
    border: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
  }
  .fx-toggle button {
    padding: 4px 12px;
    font: inherit;
    font-size: 12px;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .fx-toggle button.is-on {
    background: var(--ink, #1d1d1f);
    color: var(--paper, #fff);
  }

  .fx-side {
    flex: 0 0 320px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--line, #ededef);
  }

  .fx-add {
    margin: 12px;
    padding: 6px 8px;
    font: inherit;
    font-size: 13px;
    border: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
  }

  .fx-stack {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0 12px;
    list-style: none;
  }

  .fx-step {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    margin-bottom: 8px;
    border: 1px solid var(--line, #ededef);
  }
  .fx-step.is-off {
    opacity: 0.5;
  }

  .fx-step-head {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .fx-step-name {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
  }

  .fx-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 0;
    background: transparent;
    color: var(--ink-soft, #6e6e73);
    cursor: pointer;
  }
  .fx-icon:hover:not(:disabled) {
    background: var(--paper-2, #f9f9f9);
    color: var(--ink, #1d1d1f);
  }
  .fx-icon:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .fx-note {
    margin: 0;
    font-size: 12px;
    color: var(--ink-soft, #6e6e73);
  }
  .fx-preview .fx-note {
    position: absolute;
    top: 12px;
  }

  .fx-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--line, #ededef);
  }

  .fx-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font: inherit;
    font-size: 13px;
    border: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
    cursor: pointer;
  }
  .fx-button.is-primary {
    background: var(--ink, #1d1d1f);
    color: var(--paper, #fff);
    border-color: var(--ink, #1d1d1f);
  }
  .fx-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  :global(.fx-spin) {
    animation: fx-spin 900ms linear infinite;
  }
  @keyframes fx-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
