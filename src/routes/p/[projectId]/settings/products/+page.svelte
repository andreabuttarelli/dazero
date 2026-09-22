<script lang="ts">
  let { data } = $props();
</script>

<section class="panel">
  <h2 class="panel-title">Products ({data.products.length})</h2>
  {#if data.products.length}
    <div class="grid">
      {#each data.products as p (p.id)}
        {@const image = Array.isArray(p.images) ? (p.images as { url?: string }[])[0]?.url : null}
        <div class="product">
          <div class="pimg" style={image ? `background-image:url(${image})` : ''}>
            {#if !image}<span class="ph">{(p.title ?? '?').slice(0, 1)}</span>{/if}
          </div>
          <div class="pinfo">
            <div class="ptitle">{p.title}</div>
            {#if p.price != null}<div class="pprice">{p.price} {p.currency ?? ''}</div>{/if}
            {#if !p.available}<div class="punavailable">Unavailable</div>{/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">No products yet. Run <code>dazero products &lt;slug&gt; sync</code> to import the catalog from the connected store.</div>
  {/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: 20px; }
  .panel-title { font-size: 20px; font-weight: 600; margin: 0; color: var(--ink); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .product { display: flex; flex-direction: column; gap: 8px; }
  .pimg {
    aspect-ratio: 1; background: var(--paper-2); border: 1px solid var(--line);
    background-size: cover; background-position: center;
    display: flex; align-items: center; justify-content: center;
  }
  .ph { font-size: 24px; font-weight: 700; color: var(--ink-faint); }
  .pinfo { display: flex; flex-direction: column; gap: 2px; }
  .ptitle { font-size: 13px; font-weight: 600; color: var(--ink); }
  .pprice { font-size: 12px; color: var(--ink-soft); }
  .punavailable { font-size: 11px; color: #b25000; }

  .empty { font-size: 14px; color: var(--ink-soft); line-height: 1.6; }
  .empty code { font-family: monospace; background: var(--paper-2); padding: 1px 4px; }
</style>
