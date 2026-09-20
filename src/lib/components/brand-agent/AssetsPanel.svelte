<script lang="ts">
  let { brandSlug }: { brandSlug: string } = $props();

  type Asset = { id: string; kind: string; title: string | null; url: string };

  let assets = $state<Asset[]>([]);
  let loading = $state(true);
  let failed = $state(false);

  $effect(() => {
    const url = `/api/v1/brands/${brandSlug}/agent/assets`;
    loading = true;
    failed = false;

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { assets?: Asset[] }) => (assets = data.assets ?? []))
      .catch(() => (failed = true))
      .finally(() => (loading = false));
  });

  const isVideo = (asset: Asset) => asset.kind === 'video';
</script>

<div class="panel">
  {#if loading}
    <p class="hint">…</p>
  {:else if failed}
    <p class="hint">Non riesco a leggere i media.</p>
  {:else if !assets.length}
    <p class="hint">Nessun media, per ora.</p>
  {:else}
    <div class="grid">
      {#each assets as asset (asset.id)}
        <a class="cell" href={asset.url} target="_blank" rel="noreferrer" title={asset.title ?? ''}>
          {#if isVideo(asset)}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={asset.url} muted playsinline preload="metadata"></video>
            <span class="badge" aria-hidden="true">▶</span>
          {:else}
            <img src={asset.url} alt={asset.title ?? ''} loading="lazy" />
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .hint {
    margin: 0;
    padding: 16px 0;
    text-align: center;
    font-size: 12.5px;
    color: var(--ink-soft, #6e6e73);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 5px;
    padding: 2px 0 8px;
  }
  .cell {
    position: relative;
    display: block;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface, #f5f5f7);
  }
  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .badge {
    position: absolute;
    right: 4px;
    bottom: 3px;
    font-size: 9px;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }
  .cell:focus-visible {
    outline: 2px solid var(--accent, #7c5cff);
    outline-offset: 1px;
  }
</style>
