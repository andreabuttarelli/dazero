<script lang="ts">
  import { applyStack, type EffectStep, type Pixels } from '$lib/canvas/effects';
  import { fitWithin } from '$lib/canvas/effects/editor';

  const MAX_SIDE = 480;
  const FRAME_INTERVAL_MS = 1000 / 24;

  let {
    url,
    kind,
    effects
  }: {
    url: string;
    kind: 'image' | 'video';
    effects: EffectStep[];
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    JSON.stringify(effects);
    if (!canvas) {
      return;
    }
    const target = canvas;
    let stopped = false;
    let frame = 0;

    if (kind === 'image') {
      void fetch(url)
        .then((response) => response.blob())
        .then(createImageBitmap)
        .then((bitmap) => {
          if (!stopped) {
            draw(target, bitmap, bitmap.width, bitmap.height, effects);
          }
          bitmap.close();
        })
        .catch(() => {});
    } else {
      const video = document.createElement('video');
      video.src = url;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      let lastFrameAt = 0;
      const render = (now: number) => {
        if (now - lastFrameAt >= FRAME_INTERVAL_MS && video.readyState >= video.HAVE_CURRENT_DATA) {
          draw(target, video, video.videoWidth, video.videoHeight, effects);
          lastFrameAt = now;
        }
        frame = requestAnimationFrame(render);
      };
      video.onloadeddata = () => {
        void video.play();
        frame = requestAnimationFrame(render);
      };

      return () => {
        stopped = true;
        cancelAnimationFrame(frame);
        video.pause();
        video.removeAttribute('src');
        video.load();
      };
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  });

  function draw(
    target: HTMLCanvasElement,
    source: CanvasImageSource,
    width: number,
    height: number,
    steps: EffectStep[]
  ) {
    const size = fitWithin(width, height, MAX_SIDE);
    const scratch = document.createElement('canvas');
    scratch.width = size.width;
    scratch.height = size.height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return;
    }
    context.drawImage(source, 0, 0, size.width, size.height);
    const image = context.getImageData(0, 0, size.width, size.height);
    const pixels: Pixels = { width: size.width, height: size.height, data: image.data };
    const rendered = applyStack(pixels, effects);
    target.width = rendered.width;
    target.height = rendered.height;
    target.getContext('2d')?.putImageData(
      new ImageData(new Uint8ClampedArray(rendered.data), rendered.width, rendered.height),
      0,
      0
    );
  }
</script>

<canvas bind:this={canvas} aria-label="Anteprima effetti"></canvas>

<style>
  canvas {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
  }
</style>
