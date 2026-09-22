<script lang="ts">
  /**
   * ASSET E BRAND DEL PROGETTO, DRAGGABILI SULLA TELA CHE È GIÀ APERTA.
   *
   * `/p/<progetto>/assets` e `/p/<progetto>/brands` hanno la stessa card, ma sono un'altra
   * rotta: un `dragstart` lì non arriva a un `ondrop` qui, la navigazione li separa. Questo
   * pannello vive nella sidebar (`DashboardSidebar`, pannello "assets"), che sta SEMPRE accanto
   * alla tela — è l'unico posto da cui trascinare davvero funziona senza aprire due schede.
   *
   * `assetDrag`/`brandFieldDrag` (`drag-payload.ts`) costruiscono lo stesso pacchetto delle
   * pagine dedicate: una card di qui e una di là finiscono sulla tela nello stesso modo.
   */
  import { assetDrag, brandFieldDrag, CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag } from '$lib/canvas/drag-payload';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';

  type PanelAsset = {
    id: string;
    type: string;
    url: string | null;
    signedUrl: string | null;
    content: string | null;
    mimeType: string | null;
  };

  type PanelBrand = {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    logoAssetId: string | null;
    shortDescription: string | null;
    content: string | null;
  };

  let { projectId }: { projectId: string } = $props();

  let assets = $state<PanelAsset[]>([]);
  let brands = $state<PanelBrand[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let reload = $state(0);

  function retry() {
    reload += 1;
  }

  // `live` scarta risposte rimaste indietro: cambio progetto o un Riprova più veloce della
  // risposta precedente non devono lasciare sullo scaffale il materiale di un altro progetto.
  $effect(() => {
    const id = projectId;
    void reload;

    if (!id) {
      loading = false;
      failed = false;
      assets = [];
      brands = [];
      return;
    }

    let live = true;
    loading = true;
    failed = false;

    Promise.all([
      fetch(`/api/v1/projects/${id}/agent/assets`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      fetch(`/api/v1/projects/${id}/agent/brands`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    ])
      .then(([assetsRes, brandsRes]: [{ assets?: PanelAsset[] }, { brands?: PanelBrand[] }]) => {
        if (!live) return;
        assets = assetsRes.assets ?? [];
        brands = brandsRes.brands ?? [];
      })
      .catch(() => {
        if (live) failed = true;
      })
      .finally(() => {
        if (live) loading = false;
      });

    return () => {
      live = false;
    };
  });

  function onAssetDragStart(e: DragEvent, item: PanelAsset) {
    const drag = assetDrag(item);
    if (!drag || !e.dataTransfer) return;

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag(drag));
    e.dataTransfer.setData(CANVAS_DRAG_MEDIUM, drag.type);
  }

  function onBrandDragStart(e: DragEvent, brand: PanelBrand, field: 'logo' | 'text' | 'content') {
    const drag = brandFieldDrag(brand, field);
    if (!drag || !e.dataTransfer) return;

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag(drag));
    e.dataTransfer.setData(CANVAS_DRAG_MEDIUM, drag.type);
  }

  const hasAnything = $derived(assets.length > 0 || brands.length > 0);
</script>

<div class="panel">
  {#if loading}
    <div class="grid" aria-hidden="true">
      {#each Array(6) as _}
        <span class="skel"></span>
      {/each}
    </div>
  {:else if failed}
    <div class="state">
      <p class="hint">Can't read the project's material.</p>
      <button type="button" class="retry" onclick={retry}>Retry</button>
    </div>
  {:else if !hasAnything}
    <p class="hint">Nothing to drag yet. Generate or upload something first.</p>
  {:else}
    {#if assets.length}
      <h4 class="section">Assets</h4>
      <div class="grid">
        {#each assets as item (item.id)}
          {@const draggableItem = assetDrag(item)}
          <!-- svelte-ignore a11y_no_static_element_interactions -- trascinare è una scorciatoia,
               chi non può trascinare arriva comunque al materiale da /assets. -->
          <div
            class="tile"
            draggable={Boolean(draggableItem)}
            ondragstart={(e) => onAssetDragStart(e, item)}
          >
            {#if item.type === 'image' && item.signedUrl}
              <img src={item.signedUrl} alt="" loading="lazy" decoding="async" />
            {:else if item.type === 'video' && item.signedUrl}
              <video src={item.signedUrl} muted playsinline preload="metadata"></video>
            {:else}
              <span class="ph">{item.type}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if brands.length}
      <h4 class="section">Brands</h4>
      <div class="brand-list">
        {#each brands as brand (brand.id)}
          <div class="brand-card">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="brand-logo"
              draggable={Boolean(brand.logoAssetId)}
              ondragstart={(e) => onBrandDragStart(e, brand, 'logo')}
            >
              {#if brand.logoUrl}
                <img src={brand.logoUrl} alt="" loading="lazy" />
              {:else}
                <span class="logo-ph">{brand.name.slice(0, 2).toUpperCase()}</span>
              {/if}
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="brand-name" draggable="true" ondragstart={(e) => onBrandDragStart(e, brand, 'text')}>
              {brand.name}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .panel {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    display: flex;
    flex-direction: column;
  }

  .section {
    margin: 10px 2px 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-faint, #9a9a9e);
  }
  .section:first-child {
    margin-top: 2px;
  }

  .hint {
    margin: auto 0;
    padding: 16px 4px;
    text-align: center;
    font-size: 12.5px;
    color: var(--ink-soft, #6e6e73);
  }
  .state {
    margin: auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 4px;
  }
  .state .hint {
    margin: 0;
    padding: 0;
  }
  .retry {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 2px 0;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-ink, var(--accent, #7c5cff));
    cursor: pointer;
  }
  .retry:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    padding: 2px 1px 10px;
  }
  .tile {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--line, #ededef);
    border-radius: 0;
    background: var(--paper-2, #f9f9f9);
  }
  .tile[draggable='true'] {
    cursor: grab;
  }
  .tile img,
  .tile video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 10px;
    color: var(--ink-faint, #9a9a9e);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .skel {
    aspect-ratio: 1;
    border: 1px solid var(--line, #ededef);
    border-radius: 0;
    background: var(--paper-2, #f9f9f9);
    animation: skel-pulse 1.2s ease-in-out infinite;
  }
  @keyframes skel-pulse {
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .skel {
      animation: none;
    }
  }

  .brand-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 1px 10px;
  }
  .brand-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border: 1px solid var(--line, #ededef);
    border-radius: 0;
    background: var(--paper-2, #f9f9f9);
  }
  .brand-logo {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    overflow: hidden;
    border: 1px solid var(--line, #ededef);
    border-radius: 0;
    background: var(--paper, #fff);
    display: grid;
    place-items: center;
    cursor: grab;
  }
  .brand-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .logo-ph {
    font-size: 10px;
    font-weight: 700;
    color: var(--ink-faint, #9a9a9e);
  }
  .brand-name {
    min-width: 0;
    flex: 1;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: grab;
  }
</style>
