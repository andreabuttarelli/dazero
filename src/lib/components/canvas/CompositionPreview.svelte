<script lang="ts">
  import type { CompositionNode } from '$lib/canvas/composition-node';
  import type { CompositionScene } from '$lib/canvas/composition/scene';
  import { createSceneWhenMounted } from '$lib/canvas/composition-editor';

  let { node, mediaUrls }: { node: CompositionNode; mediaUrls: string[] } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let scene: CompositionScene | null = null;
  let build = 0;

  $effect(() => {
    void node;
    void mediaUrls;
    if (!canvas || mediaUrls.length === 0) {
      return;
    }

    const activeCanvas = canvas;
    const activeBuild = ++build;
    let stopped = false;
    let frame = 0;
    let observer: ResizeObserver | null = null;

    void createSceneWhenMounted(
      activeCanvas,
      () => !stopped && canvas === activeCanvas && build === activeBuild,
      async () => {
        const { createCompositionScene } = await import('$lib/canvas/composition/scene');
        return (target) => createCompositionScene(target, {
          media: mediaUrls.map((url) => ({ url, kind: 'image' as const, aspect: 1 })),
          layout: node.layout,
          layoutParams: node.layoutParams,
          camera: node.camera.preset,
          cameraParams: node.camera.params,
          background: node.background.color,
          duration: node.duration
        });
      }
    ).then((next) => {
      if (!next) {
        return;
      }
      scene?.dispose();
      scene = next;

      const resize = () => scene?.resize(activeCanvas.clientWidth, activeCanvas.clientHeight);
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(activeCanvas);

      const startedAt = performance.now();
      const render = (now: number) => {
        scene?.renderAt(((now - startedAt) / 1000) % node.duration);
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      scene?.dispose();
      scene = null;
    };
  });
</script>

<canvas bind:this={canvas} aria-label="Anteprima composizione"></canvas>

<style>
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    background: #000;
  }
</style>
