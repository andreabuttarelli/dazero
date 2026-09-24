<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { guideEntries, type GuideEntry } from '$lib/content/guides';
  import { renderDocHtml } from '$lib/canvas/doc-render';

  let open = $state<GuideEntry | null>(null);
</script>

{#if open}
  <div class="guide-open">
    <button type="button" class="guide-back" onclick={() => (open = null)}>
      ← {$_('app.shell.guideBack')}
    </button>
    <div class="guide-doc">{@html renderDocHtml(open.content)}</div>
  </div>
{:else}
  <ul class="guide-list">
    {#each guideEntries as guide (guide.slug)}
      <li>
        <button type="button" class="guide-item" onclick={() => (open = guide)}>
          {guide.title}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .guide-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .guide-item {
    width: 100%;
    text-align: left;
    padding: 10px 8px;
    border: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
    font: inherit;
    cursor: pointer;
  }

  .guide-item:hover {
    background: var(--surface-hover, #f5f5f7);
  }

  .guide-open {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    overflow: auto;
  }

  .guide-back {
    align-self: flex-start;
    border: 0;
    background: transparent;
    color: var(--accent-ink, var(--accent, #7c5cff));
    font: inherit;
    cursor: pointer;
    padding: 4px 0;
  }

  .guide-doc :global(h1) {
    font-size: 15px;
    margin: 0 0 8px;
  }

  .guide-doc :global(h2) {
    font-size: 13px;
    margin: 16px 0 6px;
  }

  .guide-doc :global(p),
  .guide-doc :global(li) {
    font-size: 13px;
    line-height: 1.5;
  }

  .guide-doc :global(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 12.5px;
  }

  .guide-doc :global(th),
  .guide-doc :global(td) {
    border: 1px solid var(--line, #ededef);
    padding: 4px 6px;
    text-align: left;
  }
</style>
