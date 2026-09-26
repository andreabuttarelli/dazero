<script lang="ts">
  import ImageIcon from '@lucide/svelte/icons/image';
  import type { EffectsNode } from '$lib/canvas/effects-node';

  let {
    node,
    imageUrl = null,
    sourceImageUrl = null,
    inputChanged = false,
    onopeneditor
  }: {
    node: EffectsNode;
    imageUrl?: string | null;
    sourceImageUrl?: string | null;
    inputChanged?: boolean;
    onopeneditor: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="effects" ondblclick={onopeneditor}>
  {#if node.refId && imageUrl}
    {#if node.mediaKind === 'video'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="effects-photo" src={imageUrl} autoplay muted loop playsinline></video>
    {:else}
      <img class="effects-photo" src={imageUrl} alt="Risultato" loading="lazy" />
    {/if}
  {:else if node.sourceRefId && sourceImageUrl}
    <div class="effects-unapplied">
      {#if node.mediaKind === 'video'}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video class="effects-photo" src={sourceImageUrl} autoplay muted loop playsinline></video>
      {:else}
        <img class="effects-photo" src={sourceImageUrl} alt="Immagine collegata" loading="lazy" />
      {/if}
      <span class="effects-badge">Non applicato</span>
    </div>
  {:else}
    <div class="effects-empty">
      <ImageIcon size={22} strokeWidth={1.5} />
      <p>Collega un’immagine o un video</p>
    </div>
  {/if}

  <div class="effects-actions">
    {#if inputChanged}
      <button type="button" class="effects-action is-warn nodrag" onclick={onopeneditor}>Input cambiato · Riapplica</button>
    {/if}
    <button type="button" class="effects-action nodrag" onclick={onopeneditor}>Apri editor</button>
  </div>
</div>

<style>
  .effects {
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
  .effects:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .effects {
      transition: none;
    }
  }

  .effects-photo {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: var(--paper-2, #f9f9f9);
  }

  .effects-unapplied {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .effects-badge {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 2px 6px;
    font-size: 10.5px;
    color: var(--paper, #fff);
    background: rgb(0 0 0 / 0.6);
  }

  .effects-actions {
    position: absolute;
    right: 8px;
    top: 8px;
    display: flex;
    gap: 4px;
  }

  .effects-action {
    padding: 3px 8px;
    font: inherit;
    font-size: 11px;
    border: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
    color: var(--ink, #1d1d1f);
    cursor: pointer;
  }
  .effects-action.is-warn {
    border-color: #d97706;
    color: #b45309;
  }

  .effects-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px;
    color: var(--ink-soft, #6e6e73);
    text-align: center;
  }
  .effects-empty p {
    margin: 0;
    font-size: 11.5px;
  }
</style>
