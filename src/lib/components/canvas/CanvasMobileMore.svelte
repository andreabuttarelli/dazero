<script lang="ts">
  import { _ } from 'svelte-i18n';
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import { MOBILE_MORE_ENTRIES } from '$lib/shell-nav';
  import { navHref } from '$lib/shell-nav';
  import Images from '@lucide/svelte/icons/images';
  import Building from '@lucide/svelte/icons/building';
  import Megaphone from '@lucide/svelte/icons/megaphone';
  import Settings from '@lucide/svelte/icons/settings';
  import type { Component } from 'svelte';
  import type { NavEntry } from '$lib/shell-nav';

  const ICONS: Record<NavEntry['icon'], Component<{ size?: number }>> = {
    images: Images,
    building: Building,
    megaphone: Megaphone,
    settings: Settings
  };

  /**
   * "MORE" SU MOBILE: Assets, Brands, Ads, Settings come rotte intere — su schermo piccolo non
   * esistono pannelli non modali né fogli flottanti (CLAUDE.md), solo pagine a schermo pieno.
   */
  let { projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void } = $props();
</script>

<Sheet.Root {open} {onOpenChange}>
  <Sheet.Content side="bottom" class="mobile-more">
    <Sheet.Header>
      <Sheet.Title>{$_('app.shell.mobile.more')}</Sheet.Title>
    </Sheet.Header>
    <div class="list">
      {#each MOBILE_MORE_ENTRIES as entry (entry.id)}
        {@const Icon = ICONS[entry.icon]}
        <a href={navHref(projectId, entry)} class="row">
          <Icon size={17} />
          <span>{$_(entry.labelKey)}</span>
        </a>
      {/each}
    </div>
  </Sheet.Content>
</Sheet.Root>

<style>
  .list {
    display: flex;
    flex-direction: column;
    padding: 4px 4px 16px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px;
    text-decoration: none;
    color: var(--ink, #1d1d1f);
    font-size: 14px;
    font-weight: 600;
  }
  .row:hover {
    background: var(--paper-2, #f9f9f9);
  }
</style>
