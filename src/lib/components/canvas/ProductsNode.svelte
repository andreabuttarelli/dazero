<script lang="ts">
  /**
   * IL NODO `products`, disegnato: la query in alto, il carosello sotto.
   *
   * Stesso patto di `DocNode`/`IframeNode` — nasce pieno di config e non genera — ma con una
   * differenza: il contenuto (i prodotti) non arriva da `data`, arriva da una lista che il server
   * ha letto dalla tabella `products` e passato da fuori. `nodes.data` porta SOLO la query, mai il
   * catalogo — un carosello di 250 prodotti dentro la riga del nodo viaggerebbe intero a ogni
   * evento realtime, cioè a ogni trascinamento di quel nodo.
   */
  import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { ADDABLE_LABEL } from '$lib/canvas/addable';
  import { PRODUCT_PLATFORMS, type ProductsNode } from '$lib/canvas/products-node';
  import { canStartSync, syncBlockedReason } from '$lib/canvas/sync-state';
  import type { Product } from '$lib/server/repos/products';

  let {
    node,
    products = [],
    onchange,
    onsync
  }: {
    node: ProductsNode;
    products?: Product[];
    onchange?: (patch: Partial<ProductsNode>) => void;
    onsync?: () => void;
  } = $props();

  let index = $state(0);
  const current = $derived(products[Math.min(index, Math.max(products.length - 1, 0))] ?? null);
  const blocked = $derived(syncBlockedReason(node));
  const canSync = $derived(canStartSync(node) && node.url.trim().length > 0);

  function prev() {
    index = index <= 0 ? products.length - 1 : index - 1;
  }
  function next() {
    index = index >= products.length - 1 ? 0 : index + 1;
  }
</script>

<div class="products">
  <div class="products-tag">
    <ShoppingBag size={13} strokeWidth={1.8} />
    <span>{ADDABLE_LABEL.products}</span>
  </div>

  <header class="products-head">
    <select
      class="products-field"
      value={node.platform}
      onchange={(e) => onchange?.({ platform: e.currentTarget.value as ProductsNode['platform'] })}
      aria-label="Piattaforma"
    >
      {#each PRODUCT_PLATFORMS as platform (platform)}
        <option value={platform}>{platform === 'shopify' ? 'Shopify' : 'WooCommerce'}</option>
      {/each}
    </select>

    <input
      class="products-field products-url"
      type="url"
      placeholder="https://store.example.com"
      value={node.url}
      oninput={(e) => onchange?.({ url: e.currentTarget.value })}
      aria-label="Indirizzo dello store"
    />

    <button type="button" class="products-sync" onclick={() => onsync?.()} disabled={!canSync} title={blocked ?? 'Sincronizza'}>
      <RefreshCw size={13} strokeWidth={1.8} class={node.syncStatus === 'running' ? 'is-spinning' : ''} />
    </button>
  </header>

  <div class="products-body">
    {#if node.syncStatus === 'failed' && node.syncError}
      <div class="products-fail" role="alert">
        <p class="products-fail-title">Sincronizzazione non riuscita</p>
        <p class="products-fail-why">{node.syncError}</p>
      </div>
    {:else if !products.length}
      <p class="products-empty">
        {node.url.trim() ? 'Nessun prodotto ancora scaricato. Premi sincronizza.' : 'Scrivi l\'indirizzo dello store.'}
      </p>
    {:else if current}
      <div class="products-carousel">
        {#if products.length > 1}
          <button type="button" class="products-nav products-nav-prev" onclick={prev} aria-label="Prodotto precedente">
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
        {/if}

        <div class="products-card">
          {#if current.images[0]?.url}
            <img class="products-photo" src={current.images[0].url} alt={current.title} loading="lazy" />
          {:else}
            <div class="products-photo products-photo-empty"><ShoppingBag size={22} strokeWidth={1.5} /></div>
          {/if}
          <div class="products-info">
            <p class="products-title">{current.title}</p>
            {#if current.price !== null}
              <p class="products-price">{current.price.toFixed(2)}{current.currency ? ` ${current.currency}` : ''}</p>
            {/if}
            {#if current.url}
              <a class="products-link" href={current.url} target="_blank" rel="noreferrer">Apri sullo store</a>
            {/if}
          </div>
        </div>

        {#if products.length > 1}
          <button type="button" class="products-nav products-nav-next" onclick={next} aria-label="Prodotto successivo">
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        {/if}
      </div>

      <div class="products-count" aria-live="polite">{index + 1} / {products.length}</div>
    {/if}
  </div>
</div>

<style>
  .products {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    border-radius: 16px;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #e5e5e5);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.05),
      0 8px 24px -12px rgb(0 0 0 / 0.2);
    overflow: hidden;
    transition: box-shadow 140ms ease;
  }
  .products:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .products {
      transition: none;
    }
  }

  .products-tag {
    position: absolute;
    z-index: 2;
    top: 8px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 6px;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
    background: color-mix(in srgb, var(--paper, #fff) 86%, transparent);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 999px;
    backdrop-filter: blur(6px);
    pointer-events: none;
  }

  .products-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 9px;
    padding-right: 72px;
    border-bottom: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }

  .products-field {
    padding: 3px 7px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 7px;
  }
  .products-url {
    flex: 1;
    min-width: 0;
  }

  .products-sync {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 7px;
    cursor: pointer;
  }
  .products-sync:hover:not(:disabled) {
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }
  .products-sync:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .products-sync :global(.is-spinning) {
    animation: products-spin 900ms linear infinite;
  }
  @keyframes products-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .products-sync :global(.is-spinning) {
      animation: none;
    }
  }

  .products-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .products-empty {
    flex: 1;
    display: grid;
    place-content: center;
    margin: 0;
    padding: 0 16px;
    font-size: 12px;
    text-align: center;
    color: var(--ink-soft, #6e6e73);
  }

  .products-fail {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 12px 16px;
    text-align: center;
  }
  .products-fail-title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink, #1d1d1f);
  }
  .products-fail-why {
    margin: 0;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
    word-break: break-word;
  }

  .products-carousel {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px;
  }

  .products-nav {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--ink-soft, #6e6e73);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 999px;
    cursor: pointer;
  }
  .products-nav:hover {
    color: var(--ink, #1d1d1f);
  }

  .products-card {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 8px;
  }

  .products-photo {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: contain;
    background: var(--paper-2, #f9f9f9);
    border-radius: 10px;
  }
  .products-photo-empty {
    display: grid;
    place-content: center;
    color: var(--ink-soft, #6e6e73);
  }

  .products-info {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .products-title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink, #1d1d1f);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .products-price {
    margin: 0;
    font-size: 11.5px;
    color: var(--ink-soft, #6e6e73);
  }
  .products-link {
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
  }

  .products-count {
    flex: none;
    padding: 0 10px 8px;
    font-size: 10.5px;
    text-align: center;
    color: var(--ink-soft, #6e6e73);
  }
</style>
