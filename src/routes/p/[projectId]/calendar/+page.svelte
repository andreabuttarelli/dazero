<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import PlatformGlyph from '$lib/components/PlatformGlyph.svelte';
  import { formatFor } from '$lib/platform-capabilities';
  import type { CalendarPost } from './calendar-load';

  let { data } = $props();

  const brand = $derived(data.brand);
  const accounts = $derived(data.accounts);
  const posts = $derived(data.posts as CalendarPost[]);

  let selectedAccounts = $state<Record<string, string[]>>({});
  let scheduledForByPost = $state<Record<string, string>>({});
  let busy = $state<string | null>(null);

  function isSelected(postId: string, accountId: string): boolean {
    return (selectedAccounts[postId] ?? []).includes(accountId);
  }

  function toggleAccount(postId: string, accountId: string) {
    const current = selectedAccounts[postId] ?? [];
    const next = current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId];
    selectedAccounts = { ...selectedAccounts, [postId]: next };
  }

  function mediaKinds(post: CalendarPost): { kind: 'image' | 'video' }[] {
    return post.media.map(() => ({ kind: 'image' as const }));
  }

  function deliveredAccountIds(post: CalendarPost): Set<string> {
    return new Set(post.deliveries.map((d) => d.accountId));
  }
</script>

<div class="calendar-page">
  <header class="page-header">
    <h1>Calendar</h1>
    {#if brand}<p class="subtitle">{brand.name}</p>{/if}
  </header>

  {#if !brand}
    <div class="empty-state">
      <p>This project has no brand yet.</p>
      {#if data.brands.length}
        <p>Pick or create one in Settings → Brand.</p>
      {/if}
      <a class="cta" href={`/p/${page.params.projectId}/settings/brand`}>Go to Brand settings</a>
    </div>
  {:else if !posts.length}
    <div class="empty-state">
      <p>No posts yet for this brand.</p>
    </div>
  {:else}
    <div class="calendar-list">
      {#each posts as post (post.id)}
        {@const delivered = deliveredAccountIds(post)}
        <article class="post-card">
          <header class="post-header">
            <span class="status-badge">{post.status}</span>
            <span class="created-at">{new Date(post.createdAt).toLocaleString()}</span>
          </header>

          <p class="caption">{post.caption}</p>

          {#if post.deliveries.length}
            <ul class="deliveries">
              {#each post.deliveries as delivery (delivery.accountId)}
                <li class="delivery-row">
                  <PlatformGlyph platform={delivery.platform} />
                  <span class="delivery-status">{delivery.status}</span>
                  {#if delivery.url}
                    <a href={delivery.url} target="_blank" rel="noreferrer">View</a>
                  {/if}
                  {#if delivery.error}
                    <span class="delivery-error">{delivery.error}</span>
                  {/if}

                  <form
                    method="POST"
                    action="?/cancel"
                    use:enhance={() => {
                      busy = `${post.id}:${delivery.accountId}`;
                      return async ({ update }) => {
                        await update();
                        busy = null;
                      };
                    }}
                  >
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="accountId" value={delivery.accountId} />
                    <button type="submit" disabled={busy === `${post.id}:${delivery.accountId}`}>Cancel</button>
                  </form>

                  <form
                    method="POST"
                    action="?/reschedule"
                    use:enhance={() => {
                      busy = `${post.id}:${delivery.accountId}`;
                      return async ({ update }) => {
                        await update();
                        busy = null;
                      };
                    }}
                  >
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="accountId" value={delivery.accountId} />
                    <input
                      type="datetime-local"
                      name="scheduledFor"
                      bind:value={scheduledForByPost[`${post.id}:${delivery.accountId}`]}
                    />
                    <button type="submit" disabled={busy === `${post.id}:${delivery.accountId}`}>Reschedule</button>
                  </form>
                </li>
              {/each}
            </ul>
          {/if}

          {#if accounts.length}
            <div class="account-picker">
              {#each accounts as account (account.id)}
                {#if !delivered.has(account.id)}
                  <label class="account-option" for={`account-${post.id}-${account.id}`}>
                    <input
                      id={`account-${post.id}-${account.id}`}
                      type="checkbox"
                      checked={isSelected(post.id, account.id)}
                      onclick={() => toggleAccount(post.id, account.id)}
                    />
                    <PlatformGlyph platform={account.platform} />
                    {account.handle ?? account.displayName ?? account.platform}
                    {#if !formatFor(account.platform, mediaKinds(post)).ok}
                      <span class="format-warning">Not supported for this media</span>
                    {/if}
                  </label>
                {/if}
              {/each}
            </div>

            <div class="post-actions">
              <form
                method="POST"
                action="?/schedule"
                use:enhance={() => {
                  busy = post.id;
                  return async ({ update }) => {
                    await update();
                    busy = null;
                  };
                }}
              >
                <input type="hidden" name="postId" value={post.id} />
                {#each selectedAccounts[post.id] ?? [] as accountId (accountId)}
                  <input type="hidden" name="accountId" value={accountId} />
                {/each}
                <input type="datetime-local" name="scheduledFor" bind:value={scheduledForByPost[post.id]} />
                <button type="submit" disabled={busy === post.id || !(selectedAccounts[post.id] ?? []).length}>
                  Schedule
                </button>
              </form>

              <form
                method="POST"
                action="?/publishNow"
                use:enhance={() => {
                  busy = post.id;
                  return async ({ update }) => {
                    await update();
                    busy = null;
                  };
                }}
              >
                <input type="hidden" name="postId" value={post.id} />
                {#each selectedAccounts[post.id] ?? [] as accountId (accountId)}
                  <input type="hidden" name="accountId" value={accountId} />
                {/each}
                <button type="submit" disabled={busy === post.id || !(selectedAccounts[post.id] ?? []).length}>
                  Publish now
                </button>
              </form>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .calendar-page {
    padding: 24px 32px;
  }

  .page-header {
    margin-bottom: 16px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 20px;
  }

  .subtitle {
    margin: 4px 0 0;
    color: var(--ink-faint, #9a9a9e);
  }

  .empty-state {
    padding: 24px 0;
  }

  .cta {
    display: inline-block;
    margin-top: 12px;
    padding: 8px 16px;
    border: 1px solid var(--line, #ededef);
    color: var(--ink, #1d1d1f);
    text-decoration: none;
  }

  .calendar-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .post-card {
    border: 1px solid var(--line, #ededef);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .post-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--ink-faint, #9a9a9e);
  }

  .status-badge {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .caption {
    margin: 0;
    white-space: pre-wrap;
  }

  .deliveries {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .delivery-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .delivery-status {
    font-weight: 600;
  }

  .delivery-error {
    color: #c0392b;
  }

  .account-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .account-option {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .format-warning {
    color: #c0392b;
    font-size: 11px;
  }

  .post-actions {
    display: flex;
    gap: 8px;
  }
</style>
