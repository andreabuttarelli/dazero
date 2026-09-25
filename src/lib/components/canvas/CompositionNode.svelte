<script lang="ts">
  import Orbit from '@lucide/svelte/icons/orbit';
  import type { CompositionNode } from '$lib/canvas/composition-node';

  let {
    node,
    posterUrl = null,
    imageCount = 0,
    onopeneditor
  }: {
    node: CompositionNode;
    posterUrl?: string | null;
    imageCount?: number;
    onopeneditor: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="composition" ondblclick={onopeneditor}>
  {#if node.refId && posterUrl}
    <img class="composition-photo" src={posterUrl} alt="Composizione" loading="lazy" />
  {:else if imageCount > 0}
    <div class="composition-ready">
      <Orbit size={22} strokeWidth={1.5} />
      <p>{imageCount} immagini collegate</p>
    </div>
  {:else}
    <div class="composition-empty">
      <Orbit size={22} strokeWidth={1.5} />
      <p>Collega immagini</p>
    </div>
  {/if}

  <div class="composition-actions">
    <button type="button" class="composition-action nodrag" onclick={onopeneditor}>Apri editor</button>
  </div>
</div>

<style>
  .composition {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #e5e5e5);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.05),
      0 8px 24px -12px rgb(0 0 0 / 0.2);
    overflow: hidden;
    transition: box-shadow 140ms ease;
  }
  .composition:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .composition {
      transition: none;
    }
  }

  .composition-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--paper-2, #f9f9f9);
  }

  .composition-actions {
    position: absolute;
    right: 8px;
    top: 8px;
    display: flex;
    gap: 4px;
  }

  .composition-action {
    padding: 3px 8px;
    font: inherit;
    font-size: 11px;
    border: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
    color: var(--ink, #1d1d1f);
    cursor: pointer;
  }

  .composition-ready,
  .composition-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px;
    color: var(--ink-soft, #6e6e73);
    text-align: center;
  }
  .composition-ready p,
  .composition-empty p {
    margin: 0;
    font-size: 11.5px;
  }
</style>
