<script lang="ts">
  import AssetTile from './AssetTile.svelte';

  let { brandSlug }: { brandSlug: string } = $props();

  type Asset = { id: string; kind: string; title: string | null; url: string };

  let assets = $state<Asset[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let reload = $state(0);

  function retry() {
    reload += 1;
  }

  // `live` scarta la risposta di un fetch rimasto indietro: cambio brand o un Riprova più
  // veloce della risposta precedente non devono lasciare sullo scaffale i media sbagliati.
  $effect(() => {
    const url = brandSlug ? `/api/v1/brands/${brandSlug}/agent/assets` : '';
    void reload;

    if (!url) {
      loading = false;
      failed = false;
      assets = [];
      return;
    }

    let live = true;
    loading = true;
    failed = false;
    assets = [];

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { assets?: Asset[] }) => {
        if (live) {
          assets = data.assets ?? [];
        }
      })
      .catch(() => {
        if (live) {
          failed = true;
        }
      })
      .finally(() => {
        if (live) {
          loading = false;
        }
      });

    return () => {
      live = false;
    };
  });
</script>

<div class="panel">
  {#if !brandSlug}
    <p class="hint">I media arrivano dal brand.</p>
  {:else if loading}
    <div class="grid" aria-hidden="true">
      {#each Array(6) as _}
        <span class="skel"></span>
      {/each}
    </div>
  {:else if failed}
    <div class="state">
      <p class="hint">Non riesco a leggere i media.</p>
      <button type="button" class="retry" onclick={retry}>Riprova</button>
    </div>
  {:else if !assets.length}
    <p class="hint">Nessun media, per ora.</p>
  {:else}
    <div class="grid">
      {#each assets as asset (asset.id)}
        <AssetTile kind={asset.kind} title={asset.title} url={asset.url} />
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
    display: flex;
    flex-direction: column;
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
  .retry:focus-visible {
    outline: 2px solid var(--accent, #7c5cff);
    outline-offset: 2px;
  }

  /* Due colonne fisse: il pannello è stretto e una colonna sola spreca mezzo
     scaffale, tre non stanno. Griglia sempre 1:1 così le righe restano in filo. */
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    padding: 2px 1px 10px;
    animation: shelf-in 0.22s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
  }
  .skel {
    aspect-ratio: 1;
    border: 1px solid var(--line, #ededef);
    background: var(--paper-2, #f9f9f9);
    animation: skel-pulse 1.2s ease-in-out infinite;
  }
  .skel:nth-child(2) {
    animation-delay: 0.1s;
  }
  .skel:nth-child(3) {
    animation-delay: 0.2s;
  }
  .skel:nth-child(4) {
    animation-delay: 0.3s;
  }
  .skel:nth-child(5) {
    animation-delay: 0.4s;
  }
  .skel:nth-child(6) {
    animation-delay: 0.5s;
  }
  @keyframes shelf-in {
    from {
      opacity: 0;
    }
  }
  @keyframes skel-pulse {
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .grid {
      animation: none;
    }
    .skel {
      animation: none;
    }
  }
</style>
