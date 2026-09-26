<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { Snippet } from 'svelte';

  let {
    title,
    subtitle = '',
    defaultOpen = false,
    children
  }: {
    title: string;
    subtitle?: string;
    defaultOpen?: boolean;
    children: Snippet;
  } = $props();

  let open = $state(defaultOpen);
</script>

<div class="section">
  <button type="button" class="head" onclick={() => (open = !open)}>
    <span class="title-row">
      <span class="title">{title}</span>
      {#if subtitle && !open}
        <span class="subtitle">{subtitle}</span>
      {/if}
    </span>
    <ChevronDown size={14} class={open ? 'chevron is-open' : 'chevron'} />
  </button>
  {#if open}
    <div class="content">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .section {
    border-bottom: 1px solid var(--line, #ededef);
  }
  .section:last-child {
    border-bottom: none;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 9px 2px;
    appearance: none;
    border: 0;
    background: transparent;
    cursor: pointer;
    font: inherit;
    color: var(--ink, #1d1d1f);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .title {
    font-size: 12px;
    font-weight: 600;
  }
  .subtitle {
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.chevron) {
    flex: 0 0 auto;
    color: var(--ink-soft, #6e6e73);
    transition: transform 160ms ease;
  }
  :global(.chevron.is-open) {
    transform: rotate(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.chevron) {
      transition: none;
    }
  }

  .content {
    padding: 0 2px 10px;
  }
</style>
