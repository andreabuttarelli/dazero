<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { CAMERA_PRESETS, type CameraPresetId } from '$lib/canvas/composition/camera';
  import { LAYOUTS } from '$lib/canvas/composition/index';
  import type { LayoutId, LayoutParams } from '$lib/canvas/composition/types';
  import type { CompositionMedia, CompositionScene } from '$lib/canvas/composition/scene';

  const PLACEHOLDER_COLORS = ['#e4572e', '#29335c', '#f3a712', '#669900', '#a288e3', '#2ec4b6'];
  const PLACEHOLDER_SIZE = 512;

  let canvas: HTMLCanvasElement;
  let layoutId = $state<LayoutId>('tilted-grid');
  let cameraId = $state<CameraPresetId>('slow-orbit');
  let layoutParams = $state<LayoutParams>(defaultParams(LAYOUTS['tilted-grid'].params));
  let cameraParams = $state<LayoutParams>(defaultParams(CAMERA_PRESETS['slow-orbit'].params));
  let time = $state(0);
  let playing = $state(false);
  let scene: CompositionScene | null = null;

  function defaultParams(defs: { name: string; default: number | string }[]): LayoutParams {
    return Object.fromEntries(defs.map((def) => [def.name, def.default]));
  }

  function placeholderMedia(): CompositionMedia[] {
    return PLACEHOLDER_COLORS.map((color, index) => ({
      url: placeholderDataUrl(color, index),
      kind: 'image',
      aspect: 1
    }));
  }

  function placeholderDataUrl(color: string, index: number): string {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = PLACEHOLDER_SIZE;
    canvasEl.height = PLACEHOLDER_SIZE;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      return '';
    }
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 160px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), PLACEHOLDER_SIZE / 2, PLACEHOLDER_SIZE / 2);
    return canvasEl.toDataURL('image/png');
  }

  async function rebuildScene() {
    scene?.dispose();
    scene = null;

    const { createCompositionScene } = await import('$lib/canvas/composition/scene');
    scene = createCompositionScene(canvas, {
      media: placeholderMedia(),
      layout: layoutId,
      layoutParams,
      camera: cameraId,
      cameraParams,
      background: '#000000'
    });
    scene.resize(canvas.clientWidth, canvas.clientHeight);
    scene.renderAt(time);
  }

  onMount(() => {
    rebuildScene();

    let raf = 0;
    function loop() {
      if (playing) {
        time += 1 / 60;
        scene?.renderAt(time);
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  });

  onDestroy(() => {
    scene?.dispose();
  });

  function onLayoutChange(next: LayoutId) {
    layoutId = next;
    layoutParams = defaultParams(LAYOUTS[next].params);
    rebuildScene();
  }

  function onCameraChange(next: CameraPresetId) {
    cameraId = next;
    cameraParams = defaultParams(CAMERA_PRESETS[next].params);
    rebuildScene();
  }

  function onLayoutParamChange(name: string, value: number | string) {
    layoutParams = { ...layoutParams, [name]: value };
    scene?.renderAt(time);
  }

  function onCameraParamChange(name: string, value: number | string) {
    cameraParams = { ...cameraParams, [name]: value };
    scene?.renderAt(time);
  }

  function onScrub(value: number) {
    time = value;
    scene?.renderAt(time);
  }
</script>

<div class="composition-dev">
  <div class="preview">
    <canvas bind:this={canvas}></canvas>
  </div>

  <div class="controls">
    <label>
      Layout
      <select value={layoutId} onchange={(e) => onLayoutChange(e.currentTarget.value as LayoutId)}>
        {#each Object.entries(LAYOUTS) as [id, def] (id)}
          <option value={id}>{def.label}</option>
        {/each}
      </select>
    </label>

    {#each LAYOUTS[layoutId].params as param (param.name)}
      <label>
        {param.label}
        {#if param.kind === 'range'}
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={param.step}
            value={layoutParams[param.name]}
            oninput={(e) => onLayoutParamChange(param.name, Number(e.currentTarget.value))}
          />
          <span>{layoutParams[param.name]}</span>
        {:else if param.kind === 'select'}
          <select
            value={layoutParams[param.name]}
            onchange={(e) => onLayoutParamChange(param.name, e.currentTarget.value)}
          >
            {#each param.options as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {/if}
      </label>
    {/each}

    <label>
      Camera
      <select value={cameraId} onchange={(e) => onCameraChange(e.currentTarget.value as CameraPresetId)}>
        {#each Object.entries(CAMERA_PRESETS) as [id, def] (id)}
          <option value={id}>{def.label}</option>
        {/each}
      </select>
    </label>

    {#each CAMERA_PRESETS[cameraId].params as param (param.name)}
      <label>
        {param.label}
        <input
          type="range"
          min={param.min}
          max={param.max}
          step={param.step}
          value={cameraParams[param.name]}
          oninput={(e) => onCameraParamChange(param.name, Number(e.currentTarget.value))}
        />
        <span>{cameraParams[param.name]}</span>
      </label>
    {/each}

    <label>
      Tempo
      <input type="range" min="0" max="20" step="0.05" value={time} oninput={(e) => onScrub(Number(e.currentTarget.value))} />
      <span>{time.toFixed(2)}s</span>
    </label>

    <button onclick={() => (playing = !playing)}>{playing ? 'Pausa' : 'Play'}</button>
  </div>
</div>

<style>
  .composition-dev {
    display: flex;
    height: 100vh;
  }

  .preview {
    flex: 1;
  }

  .preview canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .controls {
    width: 320px;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #111;
    color: #eee;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
</style>
