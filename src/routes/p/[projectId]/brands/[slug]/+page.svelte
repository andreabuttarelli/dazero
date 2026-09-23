<script lang="ts">
  /**
   * UN BRAND, PIENO — logo, nome, descrizione, content coi chip già pronti a essere trascinati.
   *
   * I CHIP SONO HTML CRUDO (`{@html}`, da `renderBrandContentHtml`), non template Svelte: un
   * `ondragstart` per ognuno non si scrive a mano, si intercetta a monte — un solo listener sul
   * contenitore, che guarda `event.target.closest('.chip')` e legge `data-*` per sapere quale
   * chip è partito. La stessa idea di `onFieldDragStart` (`brands/+page.svelte`), un livello più
   * in basso perché qui il markup non è nostro riga per riga.
   */
  import PageHead from '$lib/components/PageHead.svelte';
  import {
    brandFieldDrag,
    colourDrag,
    handleDrag,
    CANVAS_DRAG_FILLED_NODE,
    serializeFilledNodeDrag,
    type DragBrandField
  } from '$lib/canvas/drag-payload';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';
  import { renderBrandContentHtml } from '$lib/canvas/brand-content-chips';
  import '$lib/styles/doc-prose.css';

  let { data } = $props();

  const renderedContent = $derived(renderBrandContentHtml(data.brand.content ?? ''));

  function onFieldDragStart(e: DragEvent, field: DragBrandField) {
    const drag = brandFieldDrag(
      {
        name: data.brand.name,
        logoAssetId: data.brand.logoAssetId,
        logoUrl: data.brand.logoUrl,
        shortDescription: data.brand.shortDescription,
        content: data.brand.content
      },
      field
    );
    if (!drag || !e.dataTransfer) return;

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag(drag));
    e.dataTransfer.setData(CANVAS_DRAG_MEDIUM, drag.type);
  }

  function onChipDragStart(e: DragEvent) {
    const chip = (e.target as HTMLElement)?.closest<HTMLElement>('.chip');
    if (!chip || !e.dataTransfer) return;

    const kind = chip.dataset.dragKind;
    const drag =
      kind === 'colour'
        ? colourDrag({
            hex: chip.dataset.hex ?? '',
            assetId: data.colourAssets[chip.dataset.hex ?? '']?.assetId ?? null,
            url: data.colourAssets[chip.dataset.hex ?? '']?.url ?? null
          })
        : kind === 'handle'
          ? handleDrag({ platform: chip.dataset.platform ?? '', handle: chip.dataset.handle ?? '' })
          : null;

    if (!drag) return;

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag(drag));
    e.dataTransfer.setData(CANVAS_DRAG_MEDIUM, drag.type);
  }
</script>

<div class="brand-item">
  <PageHead title={data.brand.name} subtitle="Drag anything below onto a canvas." />

  <div class="head">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="logo" draggable={Boolean(data.brand.logoAssetId)} ondragstart={(e) => onFieldDragStart(e, 'logo')}>
      {#if data.brand.logoUrl}
        <img src={data.brand.logoUrl} alt="" loading="lazy" />
      {:else}
        <span class="logo-ph">{data.brand.name.slice(0, 2).toUpperCase()}</span>
      {/if}
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="names" draggable="true" ondragstart={(e) => onFieldDragStart(e, 'text')}>
      <h1>{data.brand.name}</h1>
      {#if data.brand.shortDescription}
        <p class="short">{data.brand.shortDescription}</p>
      {/if}
      {#if data.brand.website}
        <a class="website" href={data.brand.website} target="_blank" rel="noreferrer">{data.brand.website}</a>
      {/if}
    </div>
  </div>

  {#if data.brand.content}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="content-block" draggable="true" ondragstart={(e) => onFieldDragStart(e, 'content')}>
      <span class="content-label">Drag the whole document</span>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="doc-prose content" ondragstart={onChipDragStart}>
      {@html renderedContent}
    </div>
  {/if}
</div>

<style>
  .brand-item { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }

  .head { display: flex; align-items: flex-start; gap: 16px; }
  .logo {
    width: 72px; height: 72px; flex: 0 0 auto; overflow: hidden;
    background: var(--paper-2); border: 1px solid var(--line);
    display: grid; place-items: center; cursor: grab;
  }
  .logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .logo-ph { font-size: 20px; font-weight: 700; color: var(--ink-faint); }

  .names { flex: 1; min-width: 0; cursor: grab; }
  .names h1 { margin: 0; font-size: 20px; }
  .short { margin: 4px 0 0; font-size: 13px; color: var(--ink-soft); }
  .website { display: inline-block; margin-top: 4px; font-size: 12px; color: var(--accent-ink, #333); }

  .content-block {
    cursor: grab; font-size: 11px; color: var(--ink-faint);
    border: 1px dashed var(--line); padding: 6px 10px; width: fit-content;
  }

  .content { border: 1px solid var(--line); padding: 16px; }

  :global(.chip) {
    display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid var(--line); padding: 1px 6px; margin: 0 2px;
    font-size: 0.85em; cursor: grab; background: var(--paper-2);
  }
  :global(.chip-swatch) { width: 10px; height: 10px; display: inline-block; border: 1px solid var(--line); }
  :global(.chip-platform) {
    width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center;
    color: #fff; font-size: 7px; font-weight: 700;
  }
  :global(.chip-platform svg) { width: 8px; height: 8px; }
</style>
