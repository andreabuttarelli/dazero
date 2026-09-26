<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { LAYOUTS } from '$lib/canvas/composition/index';
  import { CAMERA_PRESETS, type CameraPresetId } from '$lib/canvas/composition/camera';
  import type { LayoutId, LayoutParams } from '$lib/canvas/composition/types';
  import type { CompositionMedia, CompositionScene } from '$lib/canvas/composition/scene';
  import { clampDuration, createSceneWhenMounted, defaultParamsFor, setLayoutParam } from '$lib/canvas/composition-editor';
  import type { CompositionAspect, CompositionNode } from '$lib/canvas/composition-node';
  import CompositionParamControl from './CompositionParamControl.svelte';

  const UNSAVED_PROMPT = 'Chiudere senza salvare? Le modifiche andranno perse.';
  const ASPECT_RATIOS: CompositionAspect[] = ['9:16', '1:1', '16:9'];
  const DEFAULT_BACKGROUND = '#000000';
  const DEFAULT_DURATION = 6;
  const DEFAULT_ASPECT: CompositionAspect = '9:16';

  let {
    initial,
    mediaUrls,
    onsave,
    onclose
  }: {
    initial: CompositionNode;
    mediaUrls: string[];
    onsave: (node: CompositionNode) => Promise<boolean>;
    onclose: () => void;
  } = $props();

  let layout = $state<LayoutId>(initial.layout);
  let layoutParams = $state<LayoutParams>({ ...initial.layoutParams });
  let cameraPreset = $state<CameraPresetId>(LAYOUTS[initial.layout].camera === 'fixed' ? 'static' : initial.camera.preset);
  let cameraParams = $state<LayoutParams>(
    LAYOUTS[initial.layout].camera === 'fixed'
      ? defaultParamsFor(CAMERA_PRESETS.static.params)
      : { ...initial.camera.params }
  );
  let backgroundColor = $state(initial.background.color);
  let duration = $state(initial.duration);
  let aspect = $state<CompositionAspect>(initial.aspect);

  let canvas = $state<HTMLCanvasElement | null>(null);
  let scene: CompositionScene | null = null;
  let time = $state(0);
  let playing = $state(false);
  let busy = $state(false);

  const dirty = $derived(
    layout !== initial.layout ||
      JSON.stringify(layoutParams) !== JSON.stringify(initial.layoutParams) ||
      cameraPreset !== initial.camera.preset ||
      JSON.stringify(cameraParams) !== JSON.stringify(initial.camera.params) ||
      backgroundColor !== initial.background.color ||
      duration !== initial.duration ||
      aspect !== initial.aspect
  );

  function mediaFromUrls(urls: string[]): CompositionMedia[] {
    return urls.map((url) => ({ url, kind: 'image', aspect: 1 }));
  }

  async function rebuildScene() {
    if (!canvas) {
      return;
    }
    const activeCanvas = canvas;
    scene?.dispose();
    scene = null;

    scene = await createSceneWhenMounted(
      activeCanvas,
      () => canvas === activeCanvas,
      async () => {
        const { createCompositionScene } = await import('$lib/canvas/composition/scene');
        return (target) => createCompositionScene(target, {
          media: mediaFromUrls(mediaUrls),
          layout,
          layoutParams,
          camera: cameraPreset,
          cameraParams,
          background: backgroundColor,
          duration,
          onTextureReady: () => scene?.renderAt(time)
        });
      }
    );
    if (!scene) {
      return;
    }
    scene.resize(activeCanvas.clientWidth, activeCanvas.clientHeight);
    scene.renderAt(time);
  }

  $effect(() => {
    void mediaUrls;
    rebuildScene();
  });

  $effect(() => {
    void layout;
    void cameraPreset;
    JSON.stringify(layoutParams);
    JSON.stringify(cameraParams);
    void backgroundColor;
    void duration;
    scene?.update({
      layout,
      layoutParams,
      camera: cameraPreset,
      cameraParams,
      background: backgroundColor,
      duration
    });
    scene?.renderAt(time);
  });

  $effect(() => {
    void aspect;
    const resize = requestAnimationFrame(() => {
      if (canvas) {
        scene?.resize(canvas.clientWidth, canvas.clientHeight);
        scene?.renderAt(time);
      }
    });

    return () => cancelAnimationFrame(resize);
  });

  let raf = 0;

  $effect(() => {
    function loop() {
      if (playing) {
        time = time + 1 / 60 >= duration ? 0 : time + 1 / 60;
        scene?.renderAt(time);
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  });

  $effect(() => {
    return () => {
      scene?.dispose();
    };
  });

  function onLayoutChange(next: LayoutId) {
    layout = next;
    layoutParams = defaultParamsFor(LAYOUTS[next].params);
    if (LAYOUTS[next].camera === 'fixed') {
      cameraPreset = 'static';
      cameraParams = defaultParamsFor(CAMERA_PRESETS.static.params);
    }
  }

  function onCameraChange(next: CameraPresetId) {
    cameraPreset = next;
    cameraParams = defaultParamsFor(CAMERA_PRESETS[next].params);
  }

  function onScrub(value: number) {
    time = value;
    scene?.renderAt(time);
  }

  function reset() {
    layoutParams = defaultParamsFor(LAYOUTS[layout].params);
    cameraParams = defaultParamsFor(CAMERA_PRESETS[cameraPreset].params);
    backgroundColor = DEFAULT_BACKGROUND;
    duration = DEFAULT_DURATION;
    aspect = DEFAULT_ASPECT;
    time = 0;
    scene?.renderAt(time);
  }

  function close() {
    if (busy) {
      return;
    }
    if (dirty && !confirm(UNSAVED_PROMPT)) {
      return;
    }
    onclose();
  }

  async function save() {
    if (busy) {
      return;
    }
    busy = true;
    try {
      const next: CompositionNode = {
        ...initial,
        layout,
        layoutParams,
        camera: { preset: cameraPreset, params: cameraParams },
        background: { color: backgroundColor },
        duration: clampDuration(duration),
        aspect
      };
      if (await onsave(next)) {
        onclose();
      }
    } finally {
      busy = false;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      close();
    }
  }

  const ASPECT_RATIO_VALUE: Record<CompositionAspect, number> = {
    '9:16': 9 / 16,
    '1:1': 1,
    '16:9': 16 / 9
  };
</script>

<div class="cx-backdrop" role="presentation" onclick={close}></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="cx-editor" role="dialog" aria-label="Editor composizione" tabindex="-1" {onkeydown}>
  <header class="cx-head">
    <h2>Composizione</h2>
    <div class="cx-head-actions">
      <button type="button" class="cx-reset" onclick={reset} disabled={busy}>
        <RotateCcw size={14} />
        Ripristina
      </button>
      <button type="button" class="cx-icon" aria-label="Chiudi" onclick={close}><X size={16} /></button>
    </div>
  </header>

  <div class="cx-body">
    <div class="cx-preview">
      <div class="cx-frame" style={`aspect-ratio: ${ASPECT_RATIO_VALUE[aspect]}`}>
        <canvas bind:this={canvas} class="cx-canvas" data-testid="composition-preview"></canvas>
      </div>

      <div class="cx-transport">
        <button type="button" class="cx-icon" aria-label={playing ? 'Pausa' : 'Play'} onclick={() => (playing = !playing)}>
          {#if playing}<Pause size={16} />{:else}<Play size={16} />{/if}
        </button>
        <input
          type="range"
          min="0"
          max={duration}
          step="0.05"
          value={time}
          oninput={(e) => onScrub(Number(e.currentTarget.value))}
        />
        <span class="cx-time">{time.toFixed(1)}s / {duration.toFixed(1)}s</span>
      </div>
    </div>

    <aside class="cx-side">
      <label class="cx-field">
        Layout
        <select value={layout} onchange={(e) => onLayoutChange(e.currentTarget.value as LayoutId)}>
          {#each Object.entries(LAYOUTS) as [id, def] (id)}
            <option value={id}>{def.label}</option>
          {/each}
        </select>
      </label>

      <div class="cx-param-grid">
        {#each LAYOUTS[layout].params as param (param.name)}
          <CompositionParamControl
            {param}
            value={layoutParams[param.name]}
            onchange={(value) => (layoutParams = setLayoutParam(layoutParams, param.name, value))}
          />
        {/each}
      </div>

      <label class="cx-field">
        Camera
        <select
          value={cameraPreset}
          disabled={LAYOUTS[layout].camera === 'fixed'}
          onchange={(e) => onCameraChange(e.currentTarget.value as CameraPresetId)}
        >
          {#each Object.entries(CAMERA_PRESETS) as [id, def] (id)}
            <option value={id}>{def.label}</option>
          {/each}
        </select>
      </label>

      <div class="cx-param-grid">
        {#each CAMERA_PRESETS[cameraPreset].params as param (param.name)}
          <CompositionParamControl
            {param}
            value={cameraParams[param.name]}
            onchange={(value) => (cameraParams = setLayoutParam(cameraParams, param.name, value))}
          />
        {/each}
      </div>

      <label class="cx-field">
        Sfondo
        <input type="color" value={backgroundColor} oninput={(e) => (backgroundColor = e.currentTarget.value)} />
      </label>

      <label class="cx-field">
        Durata (s)
        <input
          type="number"
          min="0.5"
          step="0.5"
          value={duration}
          onchange={(e) => (duration = clampDuration(Number(e.currentTarget.value)))}
        />
      </label>

      <label class="cx-field">
        Formato
        <select value={aspect} onchange={(e) => (aspect = e.currentTarget.value as CompositionAspect)}>
          {#each ASPECT_RATIOS as ratio (ratio)}
            <option value={ratio}>{ratio}</option>
          {/each}
        </select>
      </label>

      <footer class="cx-foot">
        <button type="button" class="cx-button" onclick={close} disabled={busy}>Annulla</button>
        <button type="button" class="cx-button is-primary" onclick={save} disabled={busy}>
          {#if busy}<LoaderCircle size={14} class="cx-spin" />{/if}
          Salva
        </button>
      </footer>
    </aside>
  </div>
</section>

<style>
  .cx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgb(0 0 0 / 0.12);
  }

  .cx-editor {
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
    .cx-editor {
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }
    .cx-body {
      flex-direction: column;
    }
    .cx-side {
      flex-basis: auto;
      border-left: 0;
      border-top: 1px solid var(--line, #ededef);
    }
  }

  .cx-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line, #ededef);
  }
  .cx-head h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .cx-head-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cx-reset {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 8px;
    font: inherit;
    font-size: 12px;
    color: var(--ink-soft, #6e6e73);
    border: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
    cursor: pointer;
  }

  .cx-reset:hover {
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }

  .cx-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .cx-preview {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    background: var(--paper-2, #f9f9f9);
  }

  .cx-frame {
    position: relative;
    max-width: 100%;
    max-height: calc(100% - 40px);
    border: 1px solid var(--line, #ededef);
  }

  .cx-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .cx-transport {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 420px;
  }
  .cx-transport input[type='range'] {
    flex: 1;
  }

  .cx-time {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft, #6e6e73);
    white-space: nowrap;
  }

  .cx-side {
    flex: 0 0 320px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding: 12px;
    overflow-y: auto;
    border-left: 1px solid var(--line, #ededef);
  }

  .cx-param-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 8px;
    padding: 10px 8px 12px;
    border: 1px solid var(--line, #ededef);
    border-radius: 10px;
    background: color-mix(in srgb, var(--paper-2, #f9f9f9) 72%, transparent);
  }

  .cx-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--ink-soft, #6e6e73);
  }
  .cx-field select,
  .cx-field input[type='number'] {
    font: inherit;
    padding: 6px 8px;
    font-size: 13px;
    color: var(--ink, #1d1d1f);
    border: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
  }
  .cx-field input[type='color'] {
    width: 48px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--line, #ededef);
  }

  .cx-icon {
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
  .cx-icon:hover {
    background: var(--paper-2, #f9f9f9);
    color: var(--ink, #1d1d1f);
  }

  .cx-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid var(--line, #ededef);
  }

  .cx-button {
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
  .cx-button.is-primary {
    background: var(--ink, #1d1d1f);
    color: var(--paper, #fff);
    border-color: var(--ink, #1d1d1f);
  }
  .cx-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  :global(.cx-spin) {
    animation: cx-spin 900ms linear infinite;
  }
  @keyframes cx-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
