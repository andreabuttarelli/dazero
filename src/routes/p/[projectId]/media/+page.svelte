<script lang="ts">
  import PageHead from '$lib/components/PageHead.svelte';

  let { data } = $props();

  type Filter = 'all' | 'generated' | 'upload';

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'generated', label: 'Generated' },
    { value: 'upload', label: 'Uploaded' }
  ];

  function filterHref(value: Filter): string {
    return value === 'all' ? `/p/${data.project.id}/media` : `/p/${data.project.id}/media?source=${value}`;
  }

  function formatBytes(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="media-page">
  <PageHead title="Media library" subtitle="Every file this project has, generated or uploaded." />

  <nav class="filters" aria-label="Filter by source">
    {#each FILTERS as f (f.value)}
      <a class="filter" class:active={data.filter === f.value} href={filterHref(f.value)}>
        {f.label}
      </a>
    {/each}
    <span class="count">{data.items.length}</span>
  </nav>

  {#if !data.items.length}
    <div class="empty">
      <h3>Nothing here yet</h3>
      <p>
        {#if data.filter === 'generated'}
          Nothing generated yet. Run a node on the canvas to fill this in.
        {:else if data.filter === 'upload'}
          Nothing uploaded yet. Drop a file onto a canvas to see it here.
        {:else}
          Generate or upload something on the canvas and it lands here.
        {/if}
      </p>
    </div>
  {:else}
    <div class="grid">
      {#each data.items as item (item.id)}
        <div class="tile">
          <span class="badge" class:generated={item.source === 'generated'}>
            {item.source === 'generated' ? 'generated' : 'uploaded'}
          </span>

          {#if item.type === 'image' && item.signedUrl}
            <img src={item.signedUrl} alt="" loading="lazy" decoding="async" />
          {:else if item.type === 'video' && item.signedUrl}
            <video src={item.signedUrl} muted playsinline preload="metadata"></video>
          {:else if item.type === 'text'}
            <p class="text-preview">{item.content}</p>
          {:else}
            <span class="ph">{item.type}</span>
          {/if}

          <div class="meta">
            <span class="dim">
              {#if item.width && item.height}{item.width}×{item.height} · {/if}{formatBytes(item.bytes)}
            </span>
            {#if item.sourceNode}
              <a class="node-link" href={`/p/${data.project.id}/c/${item.sourceNode.canvasId}`}>
                from {item.sourceNode.displayName || 'node'}
              </a>
            {:else if item.sourceNodeId}
              <span class="node-gone">node deleted</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .media-page { max-width: var(--content-max, 1100px); margin: 0 auto; padding: 0; }

  .filters { display: flex; align-items: center; gap: 6px; margin: 8px 0 18px; }
  .filter {
    font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 999px;
    color: var(--ink-soft); text-decoration: none; border: 1px solid transparent;
  }
  .filter:hover { color: var(--ink); }
  .filter.active { background: var(--paper-2); color: var(--ink); border-color: var(--line); }
  .count { margin-left: auto; font-size: 12px; color: var(--ink-faint); }

  .empty { text-align: center; padding: 48px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty h3 { margin: 0; font-size: 18px; }
  .empty p { margin: 0; color: var(--ink-soft); max-width: 420px; line-height: 1.5; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .tile {
    position: relative; border-radius: 12px; overflow: hidden; background: var(--paper-2);
    border: 1px solid var(--line); display: flex; flex-direction: column; min-height: 160px;
  }
  .tile img, .tile video { width: 100%; height: 140px; object-fit: cover; display: block; }
  .text-preview {
    margin: 0; padding: 14px; font-size: 12px; line-height: 1.4; color: var(--ink);
    height: 140px; overflow: hidden;
  }
  .ph {
    height: 140px; display: grid; place-items: center; font-size: 12px; color: var(--ink-faint);
    text-transform: uppercase; letter-spacing: 0.06em;
  }

  .badge {
    position: absolute; top: 8px; left: 8px; z-index: 1; font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.55); color: #fff;
  }
  .badge.generated { background: color-mix(in srgb, var(--accent, #6d4aff) 82%, #000); }

  .meta { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  .dim { font-size: 11px; color: var(--ink-faint); }
  .node-link { font-size: 11px; color: var(--accent, #6d4aff); text-decoration: none; }
  .node-link:hover { text-decoration: underline; }
  .node-gone { font-size: 11px; color: var(--ink-faint); font-style: italic; }
</style>
