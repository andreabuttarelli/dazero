<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { MOBILE_TABS, type MobileTab } from '$lib/shell-nav';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
  import type { Component } from 'svelte';

  const ICONS: Record<MobileTab['icon'], Component<{ size?: number }>> = {
    'layout-grid': LayoutGrid,
    'message-circle': MessageCircle,
    'calendar-days': CalendarDays,
    'more-horizontal': MoreHorizontal
  };

  /**
   * LA BARRA MOBILE: Canvas · Chat · Calendar · More, ognuna la sua rotta intera (CLAUDE.md).
   * `active` confronta l'id, non l'URL: "canvas" e "chat" non hanno un `path` proprio (sono la
   * stessa pagina canvas, con la chat aperta o chiusa — vedi `+layout.svelte`), quindi lo decide
   * chi monta questo componente, non un confronto con `page.url` che qui non avrebbe niente da
   * confrontare per quei due casi.
   */
  let {
    projectId,
    active,
    onselect
  }: {
    projectId: string;
    active: string;
    onselect: (tab: MobileTab) => void;
  } = $props();

  function hrefFor(tab: MobileTab): string | null {
    return tab.path ? `/p/${projectId}${tab.path}` : null;
  }
</script>

<nav class="tabs" aria-label={$_('app.shell.rail')}>
  {#each MOBILE_TABS as tab (tab.id)}
    {@const Icon = ICONS[tab.icon]}
    {@const href = hrefFor(tab)}
    {#if href}
      <a {href} class="tab" class:is-active={active === tab.id}>
        <Icon size={19} />
        <span>{$_(tab.labelKey)}</span>
      </a>
    {:else}
      <button type="button" class="tab" class:is-active={active === tab.id} onclick={() => onselect(tab)}>
        <Icon size={19} />
        <span>{$_(tab.labelKey)}</span>
      </button>
    {/if}
  {/each}
</nav>

<style>
  .tabs {
    display: flex;
    align-items: stretch;
    border-top: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    appearance: none;
    border: 0;
    background: transparent;
    padding: 8px 4px 6px;
    font: inherit;
    text-decoration: none;
    color: var(--ink-soft, #6e6e73);
    cursor: pointer;
  }
  .tab span {
    font-size: 10.5px;
    font-weight: 600;
  }
  .tab.is-active {
    color: var(--accent-ink, var(--accent, #7c5cff));
  }
</style>
