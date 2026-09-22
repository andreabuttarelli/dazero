<script lang="ts">
  /**
   * UN'IMMAGINE O UN VIDEO CARICATI: statici, non generati.
   *
   * Nessun prompt, nessun modello, nessun bottone «Genera», nessuna storia di giri — il nodo che
   * produce (`GenNode`) porta tutti e quattro perché serve a chi sta ancora decidendo cosa
   * vedere; qui il contenuto esiste già e non cambia. Il file è collegabile come sorgente ad
   * altri nodi (`upstream-inputs.ts` lo legge come un `image`/`video` qualunque, senza saperlo
   * caricato), quindi porta comunque gli attacchi — quello lo decide `+page.svelte` passando
   * `connectable: true`, non questo componente.
   */
  import { ADDABLE_LABEL } from '$lib/canvas/addable';
  import { ADDABLE_ICON } from '$lib/canvas/addable-icons';
  import type { UploadedNode } from '$lib/canvas/uploaded-node';

  let { node, medium }: { node: UploadedNode; medium: 'image' | 'video' } = $props();

  const TypeIcon = $derived(ADDABLE_ICON[medium]);
</script>

<div class="uploaded">
  <div class="uploaded-tag">
    <TypeIcon size={13} strokeWidth={1.8} />
    <span>{ADDABLE_LABEL[medium]}</span>
  </div>

  <div class="uploaded-body">
    {#if medium === 'image'}
      <img src={node.url} alt={node.name} loading="lazy" />
    {:else}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={node.url} controls playsinline></video>
    {/if}
  </div>
</div>

<style>
  .uploaded {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #e5e5e5);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.05),
      0 8px 24px -12px rgb(0 0 0 / 0.2);
    overflow: hidden;
  }

  .uploaded-tag {
    position: absolute;
    z-index: 2;
    top: 8px;
    left: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 6px;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
    background: color-mix(in srgb, var(--paper, #fff) 86%, transparent);
    border: 1px solid var(--line-2, #d2d2d7);
    backdrop-filter: blur(6px);
    pointer-events: none;
  }

  .uploaded-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--paper-2, #f9f9f9);
  }

  .uploaded-body img,
  .uploaded-body video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
</style>
