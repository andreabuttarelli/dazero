<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import PlatformGlyph from '$lib/components/PlatformGlyph.svelte';
  import { postCompositionFor } from '$lib/canvas/post-composition';
  import { moveMediaUp, moveMediaDown, removeMedia, defaultScheduleTime } from '$lib/canvas/create-post-composer';
  import { errorCopyFor } from '$lib/canvas/create-post-errors';
  import { closeSheet } from '$lib/canvas/sheet-nav';

  let { data, form } = $props();

  const projectId = $derived(page.params.projectId);
  const composition = $derived(postCompositionFor(data.nodes));

  let mediaOrder = $state(composition.media.map((m) => m.nodeId));

  const mediaNodes = $derived(
    mediaOrder
      .map((id) => data.nodes.find((n) => n.id === id))
      .filter((n): n is (typeof data.nodes)[number] => !!n)
  );

  let captionPick = $state(composition.captions[0]?.nodeId ?? null);
  let caption = $state(composition.captions[0]?.text ?? '');

  function pickCaption(nodeId: string) {
    captionPick = nodeId;
    const found = composition.captions.find((c) => c.nodeId === nodeId);
    if (found) caption = found.text;
  }

  let selectedBrandId = $state(data.projectBrandId ?? data.brands[0]?.id ?? '');

  const accountsForBrand = $derived(data.accountsByBrand[selectedBrandId] ?? []);
  let selectedAccountIds = $state<string[]>([]);

  function toggleAccount(accountId: string) {
    selectedAccountIds = selectedAccountIds.includes(accountId)
      ? selectedAccountIds.filter((id) => id !== accountId)
      : [...selectedAccountIds, accountId];
  }

  let scheduling = $state(false);
  let scheduledForLocal = $state(defaultScheduleTime(new Date()));
  let scheduledForIso = $derived(scheduledForLocal ? new Date(scheduledForLocal).toISOString() : '');

  const canSchedule = $derived(selectedAccountIds.length > 0);
  const formAction = $derived(data.canvasId ? `/p/${projectId}/c/${data.canvasId}?/create_post` : '');

  const errors = $derived(
    form && 'error' in form && form.error ? [form.error as string] : []
  );

  function onSubmitComplete({ result }: { result: { type: string; data?: Record<string, unknown> } }) {
    if (result.type === 'success' && result.data?.post) {
      closeSheet();
    }
  }
</script>

<div class="composer">
  <header class="composer-header">
    <h1>Create post</h1>
  </header>

  {#if errors.length}
    <div class="banner err">
      {#each errors as code (code)}
        <p>{errorCopyFor(code)}</p>
      {/each}
    </div>
  {/if}

  {#if form && 'post' in form && form.post}
    <div class="banner ok">
      Post saved. <a href={`/p/${projectId}/calendar`}>Open calendar</a>
    </div>
  {/if}

  <form
    method="POST"
    action={formAction}
    use:enhance={() => {
      return async ({ result, update }) => {
        await update();
        onSubmitComplete({ result: result as never });
      };
    }}
  >
    <input type="hidden" name="brand_id" value={selectedBrandId} />
    <input type="hidden" name="caption" value={caption} />
    {#each mediaOrder as nodeId (nodeId)}
      <input type="hidden" name="node_id" value={nodeId} />
    {/each}
    {#each selectedAccountIds as accountId (accountId)}
      <input type="hidden" name="account_id" value={accountId} />
    {/each}
    {#if scheduling}
      <input type="hidden" name="scheduled_for" value={scheduledForIso} />
    {/if}

    <section class="media-section">
      <h2>Media</h2>
      {#if !mediaNodes.length}
        <p class="empty">No media in this selection.</p>
      {/if}
      <ul class="media-list">
        {#each mediaNodes as node, i (node.id)}
          <li class="media-row">
            {#if node.mediaUrl}
              {#if node.type === 'video'}
                <video src={node.mediaUrl} muted></video>
              {:else}
                <img src={node.mediaUrl} alt="" />
              {/if}
            {/if}
            <div class="media-controls">
              <button type="button" disabled={i === 0} onclick={() => (mediaOrder = moveMediaUp(mediaOrder, node.id))}>
                Up
              </button>
              <button
                type="button"
                disabled={i === mediaNodes.length - 1}
                onclick={() => (mediaOrder = moveMediaDown(mediaOrder, node.id))}
              >
                Down
              </button>
              <button type="button" onclick={() => (mediaOrder = removeMedia(mediaOrder, node.id))}>Remove</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>

    <section class="caption-section">
      <h2>Caption</h2>
      {#if composition.captions.length > 1}
        <div class="caption-picks">
          {#each composition.captions as candidate (candidate.nodeId)}
            <label class="caption-pick">
              <input
                type="radio"
                name="caption_pick"
                checked={captionPick === candidate.nodeId}
                onchange={() => pickCaption(candidate.nodeId)}
              />
              <span>{candidate.text}</span>
            </label>
          {/each}
        </div>
      {/if}
      <textarea bind:value={caption} rows="4" placeholder="Write a caption…"></textarea>
    </section>

    <section class="brand-section">
      <h2>Brand</h2>
      {#if data.brands.length > 1}
        <select bind:value={selectedBrandId}>
          {#each data.brands as brand (brand.id)}
            <option value={brand.id}>{brand.name}</option>
          {/each}
        </select>
      {:else if data.brands.length === 1}
        <p>{data.brands[0].name}</p>
      {:else}
        <p class="empty">No brand available.</p>
      {/if}
    </section>

    <section class="accounts-section">
      <h2>Accounts</h2>
      {#if accountsForBrand.length}
        <ul class="accounts-list">
          {#each accountsForBrand as account (account.id)}
            <li>
              <label class="account-row">
                <input
                  type="checkbox"
                  checked={selectedAccountIds.includes(account.id)}
                  onchange={() => toggleAccount(account.id)}
                />
                <PlatformGlyph platform={account.platform} />
                <span>{account.handle ?? account.displayName ?? account.platform}</span>
              </label>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">
          No connected accounts.
          <a href={`/p/${projectId}/settings/connected-accounts`}>Connect one</a>
        </p>
      {/if}
    </section>

    {#if scheduling}
      <section class="schedule-section">
        <label>
          Schedule for
          <input type="datetime-local" bind:value={scheduledForLocal} />
        </label>
      </section>
    {/if}

    <footer class="composer-footer">
      <button type="submit" disabled={!composition.enabled}>Save as draft</button>
      {#if !scheduling}
        <button type="button" disabled={!composition.enabled} onclick={() => (scheduling = true)}>
          Approve and schedule
        </button>
      {:else}
        <button type="submit" disabled={!composition.enabled || !canSchedule}>Approve and schedule</button>
      {/if}
    </footer>
  </form>
</div>

<style>
  .composer {
    padding: 40px 32px;
    max-width: 640px;
    margin: 0 auto;
  }

  .composer-header h1 {
    font-size: 20px;
    margin: 0 0 24px;
  }

  section {
    margin-bottom: 24px;
  }

  section h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft, #6e6e73);
    margin: 0 0 8px;
  }

  .empty {
    color: var(--ink-faint, #9a9a9e);
    font-size: 13px;
  }

  .media-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .media-row {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--line, #e5e5e5);
    padding: 8px;
  }

  .media-row img,
  .media-row video {
    width: 64px;
    height: 64px;
    object-fit: cover;
  }

  .media-controls {
    display: flex;
    gap: 6px;
  }

  .caption-picks {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  .caption-pick {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
  }

  textarea {
    width: 100%;
    border: 1px solid var(--line, #e5e5e5);
    padding: 8px;
    font: inherit;
  }

  select {
    border: 1px solid var(--line, #e5e5e5);
    padding: 6px 8px;
    font: inherit;
  }

  .accounts-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .account-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .schedule-section label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }

  .schedule-section input {
    border: 1px solid var(--line, #e5e5e5);
    padding: 6px 8px;
    font: inherit;
  }

  .composer-footer {
    display: flex;
    gap: 8px;
  }

  .banner {
    padding: 10px 12px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .banner.err {
    background: var(--danger-bg, #fdeceb);
    color: var(--danger, #b3261e);
  }

  .banner.ok {
    background: var(--success-bg, #e8f5e9);
    color: var(--success, #1b6b30);
  }
</style>
