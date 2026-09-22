<script lang="ts">
  import PageHead from '$lib/components/PageHead.svelte';
  import { genNodeSize } from '$lib/canvas/gen-node';
  import { docNodeSize } from '$lib/canvas/doc-node';
  import {
    DRAG_NODE_KIND,
    CANVAS_DRAG_FILLED_NODE,
    serializeFilledNodeDrag,
    staticDocData,
    staticMediaData,
    staticTextData,
    type DragBrandField
  } from '$lib/canvas/drag-payload';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';
  import type { BrandCard } from './+page.server';

  let { data } = $props();

  /**
   * TRE COSE TRASCINABILI PER BRAND — la stessa tabella di `drag-payload.ts::DRAG_NODE_KIND`.
   * Il logo porta `data.assetId` (materializzato da `+page.server.ts`), i testi diventano il
   * `prompt` di un nodo `text`, il content diventa il markdown di un nodo `doc`.
   */
  function onFieldDragStart(e: DragEvent, brand: BrandCard, field: DragBrandField) {
    if (!e.dataTransfer) return;

    const nodeType = DRAG_NODE_KIND.brand[field];
    let nodeData: Record<string, unknown>;
    if (field === 'logo') {
      if (!brand.logoAssetId || !brand.logoUrl) return;
      nodeData = staticMediaData({
        assetId: brand.logoAssetId,
        url: brand.logoUrl,
        name: `${brand.name} logo`,
        mimeType: 'image/*'
      });
    } else if (field === 'text') {
      nodeData = staticTextData(`${brand.name}\n\n${brand.shortDescription ?? ''}`.trim());
    } else {
      nodeData = staticDocData(brand.content ?? '');
    }

    const size = nodeType === 'doc' ? docNodeSize() : nodeType === 'text' ? genNodeSize('text') : genNodeSize('image');

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag({ type: nodeType, data: nodeData, ...size }));
    e.dataTransfer.setData(CANVAS_DRAG_MEDIUM, nodeType);
  }
</script>

<div class="brands-page">
  <PageHead title="Brands" subtitle="Every brand your org has. Drag a logo, a text or the content onto a canvas." />

  {#if !data.brands.length}
    <div class="empty">
      <h3>No brands yet</h3>
      <p>A brand appears here once your org has one.</p>
    </div>
  {:else}
    <div class="grid">
      {#each data.brands as brand (brand.id)}
        <div class="card">
          <div class="card-head">
            <!-- svelte-ignore a11y_no_static_element_interactions -- trascinare il logo è una
                 scorciatoia: chi non può trascinare arriva comunque al brand da /settings/brand. -->
            <div
              class="logo"
              draggable={Boolean(brand.logoAssetId)}
              ondragstart={(e) => onFieldDragStart(e, brand, 'logo')}
            >
              {#if brand.logoUrl}
                <img src={brand.logoUrl} alt="" loading="lazy" />
              {:else}
                <span class="logo-ph">{brand.name.slice(0, 2).toUpperCase()}</span>
              {/if}
            </div>

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="names" draggable="true" ondragstart={(e) => onFieldDragStart(e, brand, 'text')}>
              <h3>{brand.name}</h3>
              {#if brand.shortDescription}
                <p class="short">{brand.shortDescription}</p>
              {/if}
            </div>
          </div>

          {#if brand.content}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="content" draggable="true" ondragstart={(e) => onFieldDragStart(e, brand, 'content')}>
              {brand.content.slice(0, 300)}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .brands-page { max-width: var(--content-max, 1100px); margin: 0 auto; padding: 0; }

  .empty { text-align: center; padding: 48px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty h3 { margin: 0; font-size: 18px; }
  .empty p { margin: 0; color: var(--ink-soft); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .card {
    background: var(--paper-2); border: 1px solid var(--line); padding: 14px;
    display: flex; flex-direction: column; gap: 10px;
  }

  .card-head { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 48px; height: 48px; flex: 0 0 auto; overflow: hidden;
    background: var(--paper); border: 1px solid var(--line);
    display: grid; place-items: center; cursor: grab;
  }
  .logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .logo-ph { font-size: 13px; font-weight: 700; color: var(--ink-faint); }

  .names { flex: 1; min-width: 0; cursor: grab; }
  .names h3 { margin: 0; font-size: 14px; }
  .short { margin: 2px 0 0; font-size: 12px; color: var(--ink-soft); line-height: 1.4; }

  .content {
    font-size: 12px; line-height: 1.5; color: var(--ink); cursor: grab;
    max-height: 100px; overflow: hidden; white-space: pre-wrap;
    border-top: 1px solid var(--line); padding-top: 10px;
  }
</style>
