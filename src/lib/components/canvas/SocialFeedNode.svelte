<script lang="ts">
  /**
   * IL NODO `social_account_feed`, disegnato: stesso schema di `ProductsNode` — la query in alto,
   * il carosello dei post sotto. Il contenuto arriva da fuori (i post letti da `social_posts`),
   * mai da `nodes.data`.
   */
  import Rss from '@lucide/svelte/icons/rss';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { ADDABLE_LABEL } from '$lib/canvas/addable';
  import { SOCIAL_FEED_PLATFORMS, type SocialFeedNode } from '$lib/canvas/social-feed-node';
  import { canStartSync, syncBlockedReason } from '$lib/canvas/sync-state';
  import type { SocialPost } from '$lib/server/repos/social-posts';

  let {
    node,
    posts = [],
    onchange,
    onsync
  }: {
    node: SocialFeedNode;
    posts?: SocialPost[];
    onchange?: (patch: Partial<SocialFeedNode>) => void;
    onsync?: () => void;
  } = $props();

  let index = $state(0);
  const current = $derived(posts[Math.min(index, Math.max(posts.length - 1, 0))] ?? null);
  const blocked = $derived(syncBlockedReason(node));
  const canSync = $derived(canStartSync(node) && node.handle.trim().length > 0);
  const thumbnail = $derived(
    current && typeof current.media?.thumbnailUrl === 'string' ? (current.media.thumbnailUrl as string) : null
  );

  function prev() {
    index = index <= 0 ? posts.length - 1 : index - 1;
  }
  function next() {
    index = index >= posts.length - 1 ? 0 : index + 1;
  }
</script>

<div class="feed">
  <div class="feed-tag">
    <Rss size={13} strokeWidth={1.8} />
    <span>{ADDABLE_LABEL.social_account_feed}</span>
  </div>

  <header class="feed-head">
    <select
      class="feed-field"
      value={node.platform}
      onchange={(e) => onchange?.({ platform: e.currentTarget.value as SocialFeedNode['platform'] })}
      aria-label="Piattaforma"
    >
      {#each SOCIAL_FEED_PLATFORMS as platform (platform)}
        <option value={platform}>{platform}</option>
      {/each}
    </select>

    <input
      class="feed-field feed-handle"
      type="text"
      placeholder="handle"
      value={node.handle}
      oninput={(e) => onchange?.({ handle: e.currentTarget.value })}
      aria-label="Handle dell'account"
    />

    <button type="button" class="feed-sync" onclick={() => onsync?.()} disabled={!canSync} title={blocked ?? 'Sincronizza'}>
      <RefreshCw size={13} strokeWidth={1.8} class={node.syncStatus === 'running' ? 'is-spinning' : ''} />
    </button>
  </header>

  <div class="feed-body">
    {#if node.syncStatus === 'failed' && node.syncError}
      <div class="feed-fail" role="alert">
        <p class="feed-fail-title">Sincronizzazione non riuscita</p>
        <p class="feed-fail-why">{node.syncError}</p>
      </div>
    {:else if !posts.length}
      <p class="feed-empty">
        {node.handle.trim() ? 'Nessun post ancora scaricato. Premi sincronizza.' : "Scrivi l'handle dell'account."}
      </p>
    {:else if current}
      <div class="feed-carousel">
        {#if posts.length > 1}
          <button type="button" class="feed-nav feed-nav-prev" onclick={prev} aria-label="Post precedente">
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
        {/if}

        <div class="feed-card">
          {#if thumbnail}
            <img class="feed-photo" src={thumbnail} alt={current.caption ?? ''} loading="lazy" />
          {:else}
            <div class="feed-photo feed-photo-empty"><Rss size={22} strokeWidth={1.5} /></div>
          {/if}
          <div class="feed-info">
            {#if current.caption}
              <p class="feed-caption">{current.caption}</p>
            {/if}
            {#if current.permalink}
              <a class="feed-link" href={current.permalink} target="_blank" rel="noreferrer">Apri il post</a>
            {/if}
          </div>
        </div>

        {#if posts.length > 1}
          <button type="button" class="feed-nav feed-nav-next" onclick={next} aria-label="Post successivo">
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        {/if}
      </div>

      <div class="feed-count" aria-live="polite">{index + 1} / {posts.length}</div>
    {/if}
  </div>
</div>

<style>
  .feed {
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
    transition: box-shadow 140ms ease;
  }
  .feed:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .feed {
      transition: none;
    }
  }

  .feed-tag {
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
    backdrop-filter: blur(6px);
    pointer-events: none;
  }

  .feed-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 9px;
    padding-right: 72px;
    border-bottom: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }

  .feed-field {
    padding: 3px 7px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }
  .feed-handle {
    flex: 1;
    min-width: 0;
  }

  .feed-sync {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: 1px solid var(--line-2, #d2d2d7);
    cursor: pointer;
  }
  .feed-sync:hover:not(:disabled) {
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }
  .feed-sync:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .feed-sync :global(.is-spinning) {
    animation: feed-spin 900ms linear infinite;
  }
  @keyframes feed-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .feed-sync :global(.is-spinning) {
      animation: none;
    }
  }

  .feed-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .feed-empty {
    flex: 1;
    display: grid;
    place-content: center;
    margin: 0;
    padding: 0 16px;
    font-size: 12px;
    text-align: center;
    color: var(--ink-soft, #6e6e73);
  }

  .feed-fail {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 12px 16px;
    text-align: center;
  }
  .feed-fail-title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink, #1d1d1f);
  }
  .feed-fail-why {
    margin: 0;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
    word-break: break-word;
  }

  .feed-carousel {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px;
  }

  .feed-nav {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--ink-soft, #6e6e73);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    cursor: pointer;
  }
  .feed-nav:hover {
    color: var(--ink, #1d1d1f);
  }

  .feed-card {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 8px;
  }

  .feed-photo {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: cover;
    background: var(--paper-2, #f9f9f9);
  }
  .feed-photo-empty {
    display: grid;
    place-content: center;
    color: var(--ink-soft, #6e6e73);
  }

  .feed-info {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .feed-caption {
    margin: 0;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .feed-link {
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
  }

  .feed-count {
    flex: none;
    padding: 0 10px 8px;
    font-size: 10.5px;
    text-align: center;
    color: var(--ink-soft, #6e6e73);
  }
</style>
