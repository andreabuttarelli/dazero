<script lang="ts">
  import PageHead from '$lib/components/PageHead.svelte';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { createSupabaseBrowserClient } from '$lib/supabase/client';
  import { verdictForUpload, canvasUploadPrefix } from '$lib/canvas/upload-kind';
  import { assetDrag, CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag } from '$lib/canvas/drag-payload';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';

  let { data } = $props();

  type Filter = 'all' | 'generated' | 'upload';

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'generated', label: 'Generated' },
    { value: 'upload', label: 'Uploaded' }
  ];

  function filterHref(value: Filter): string {
    return value === 'all' ? `/p/${data.project.id}/assets` : `/p/${data.project.id}/assets?source=${value}`;
  }

  function formatBytes(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * UN FILE VA DRITTO NELLO STORAGE DAL BROWSER, e solo il percorso arriva al server — lo stesso
   * schema di `[canvasId]/+page.svelte::upload`. Un documento arriva già convertito in markdown
   * quando la pagina ricarica: `registerUploadedAsset` lo fa lato server, questa pagina non
   * sa niente di conversione.
   */
  const supabase = createSupabaseBrowserClient();
  let uploading = $state(false);
  let uploadError = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  async function upload(file: File) {
    uploadError = null;
    const verdict = verdictForUpload(file.type, file.name, file.size);
    if (!verdict.ok) {
      uploadError = verdict.why;
      return;
    }

    uploading = true;
    try {
      const path = `${canvasUploadPrefix(data.orgId, data.project.id)}${crypto.randomUUID()}-${file.name}`;
      const up = await supabase.storage
        .from('canvas-assets')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (up.error) {
        uploadError = up.error.message;
        return;
      }

      const body = new FormData();
      body.set('path', path);
      body.set('file_name', file.name);
      body.set('mime_type', file.type);
      body.set('bytes', String(file.size));

      const res = await fetch('?/upload', {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
        body
      });
      const result = deserialize(await res.text());
      if (result.type !== 'success') {
        uploadError = 'non caricato';
        return;
      }
      await invalidateAll();
    } finally {
      uploading = false;
    }
  }

  function onFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void upload(file);
  }

  /** TRASCINARE UNA TILE VERSO LA TELA — `assetDrag` (`drag-payload.ts`) porta la tabella "cosa
   *  diventa", la stessa che la sidebar del progetto usa per le sue card. */
  function onTileDragStart(e: DragEvent, item: (typeof data.items)[number]) {
    const drag = assetDrag(item);
    if (!drag || !e.dataTransfer) return;

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag(drag));
    e.dataTransfer.setData(CANVAS_DRAG_MEDIUM, drag.type);
  }
</script>

<div class="media-page">
  <PageHead title="Assets" subtitle="Every file this project has, generated or uploaded." />

  <nav class="filters" aria-label="Filter by source">
    {#each FILTERS as f (f.value)}
      <a class="filter" class:active={data.filter === f.value} href={filterHref(f.value)}>
        {f.label}
      </a>
    {/each}
    <span class="count">{data.items.length}</span>

    <input
      bind:this={fileInput}
      type="file"
      class="file-input"
      onchange={onFilePicked}
      accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,.pdf,.docx,.xlsx,.xls,.html,.htm,.csv,.txt,.md,.markdown,.xml,.rss,.atom,.ipynb"
    />
    <button type="button" class="upload-btn" disabled={uploading} onclick={() => fileInput?.click()}>
      {uploading ? 'Uploading…' : 'Upload'}
    </button>
  </nav>

  {#if uploadError}
    <p class="upload-error">{uploadError}</p>
  {/if}

  {#if !data.items.length}
    <div class="empty">
      <h3>Nothing here yet</h3>
      <p>
        {#if data.filter === 'generated'}
          Nothing generated yet. Run a node on the canvas to fill this in.
        {:else if data.filter === 'upload'}
          Nothing uploaded yet. Upload a file, or drop one onto a canvas.
        {:else}
          Generate or upload something and it lands here.
        {/if}
      </p>
    </div>
  {:else}
    <div class="grid">
      {#each data.items as item (item.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -- trascinare una tile è una
             scorciatoia sulla libreria, non l'unico modo di portare l'asset sulla tela: chi usa
             la tastiera può ancora aprire il nodo dal link "from …" qui sotto. -->
        <div
          class="tile"
          draggable={Boolean(assetDrag(item))}
          ondragstart={(e) => onTileDragStart(e, item)}
        >
          <span class="badge" class:generated={item.source === 'generated'}>
            {item.source === 'generated' ? 'generated' : 'uploaded'}
          </span>

          {#if item.type === 'image' && item.signedUrl}
            <img src={item.signedUrl} alt="" loading="lazy" decoding="async" />
          {:else if item.type === 'video' && item.signedUrl}
            <video src={item.signedUrl} muted playsinline preload="metadata"></video>
          {:else if item.type === 'text'}
            <p class="text-preview">{item.content}</p>
          {:else if item.type === 'document'}
            <p class="text-preview">{(item.content ?? '').slice(0, 400)}</p>
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
    font-size: 13px; font-weight: 600; padding: 7px 14px;
    color: var(--ink-soft); text-decoration: none; border: 1px solid transparent;
  }
  .filter:hover { color: var(--ink); }
  .filter.active { background: var(--paper-2); color: var(--ink); border-color: var(--line); }
  .count { margin-left: auto; font-size: 12px; color: var(--ink-faint); }

  .file-input { display: none; }
  .upload-btn {
    font-size: 13px; font-weight: 600; padding: 7px 14px; margin-left: 10px;
    color: var(--ink); background: var(--paper); border: 1px solid var(--line); cursor: pointer;
  }
  .upload-btn:hover { background: var(--paper-2); }
  .upload-btn:disabled { opacity: 0.6; cursor: default; }

  .upload-error { margin: 0 0 12px; font-size: 12px; color: var(--danger, #c0392b); }

  .empty { text-align: center; padding: 48px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty h3 { margin: 0; font-size: 18px; }
  .empty p { margin: 0; color: var(--ink-soft); max-width: 420px; line-height: 1.5; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .tile {
    position: relative; overflow: hidden; background: var(--paper-2);
    border: 1px solid var(--line); display: flex; flex-direction: column; min-height: 160px;
  }
  .tile[draggable='true'] { cursor: grab; }
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
    padding: 2px 8px; background: rgba(0, 0, 0, 0.55); color: #fff;
  }
  .badge.generated { background: color-mix(in srgb, var(--accent, #6d4aff) 82%, #000); }

  .meta { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  .dim { font-size: 11px; color: var(--ink-faint); }
  .node-link { font-size: 11px; color: var(--accent, #6d4aff); text-decoration: none; }
  .node-link:hover { text-decoration: underline; }
  .node-gone { font-size: 11px; color: var(--ink-faint); font-style: italic; }
</style>
