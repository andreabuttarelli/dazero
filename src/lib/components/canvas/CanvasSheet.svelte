<script lang="ts">
  import { page } from '$app/state';
  import { _ } from 'svelte-i18n';
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import { openSheet, closeSheet } from '$lib/canvas/sheet-nav';
  import { settingsPageLoader } from '$lib/canvas/sheet-pages';
  import { sheetEntryForPath } from '$lib/shell-nav';
  import { SETTINGS_GROUPS } from '$lib/components/settings/platforms';
  import { cn } from '$lib/utils';
  import CalendarPage from '../../../routes/p/[projectId]/calendar/+page.svelte';
  import AdsSocialPage from '../../../routes/p/[projectId]/ads/social/+page.svelte';
  import SettingsLayout from '../../../routes/p/[projectId]/settings/+layout.svelte';

  let { projectId }: { projectId: string } = $props();

  /**
   * IL FOGLIO FLOTTANTE su Calendar/Ads/Settings — "usati AL POSTO della tela" (CLAUDE.md). Le
   * pagine sono le stesse che rispondono a un link diretto o a un refresh: un'implementazione,
   * due presentazioni. `page.state.sheet` arriva da `openSheet` (shallow routing, `sheet-nav.ts`)
   * e porta già il `data` del loro `load` — questo componente non ne rifà uno suo.
   *
   * Settings ha 13 sezioni che cambiano nel tempo (Agent F ne aggiunge): `settingsPageLoader`
   * (`sheet-pages.ts`) le trova per cartella con `import.meta.glob`, una sezione nuova non
   * richiede una riga qui, e lo switcher qui sotto legge lo stesso `SETTINGS_GROUPS` di Agent F —
   * non un elenco duplicato. Calendar e Ads non hanno sotto-sezioni, quindi restano importate
   * dirette — la stessa asimmetria che ha già il filesystem delle rotte.
   */
  const sheet = $derived(page.state.sheet ?? null);
  const entry = $derived(sheet ? sheetEntryForPath(sheet.path) : null);
  const settingsSubpath = $derived(sheet ? sheet.path.replace(/^\/settings\/?/, '') || 'connected-accounts' : '');
  const settingsLoader = $derived(sheet && entry?.id === 'settings' ? settingsPageLoader(sheet.path) : null);

  function onOpenChange(open: boolean) {
    if (!open) closeSheet();
  }

  function openSettingsSection(section: string) {
    void openSheet(projectId, `/settings/${section}`, 'replace');
  }
</script>

{#if sheet && entry}
  <Sheet.Root open {onOpenChange}>
    <Sheet.Content side="right" class="canvas-sheet" showOverlay={false}>
      {#if entry.id === 'settings'}
        <div class="settings-shell">
          <nav class="settings-switcher" aria-label={$_('app.nav.settings')}>
            {#each SETTINGS_GROUPS as group (group.labelKey)}
              <p class="switcher-group">{$_(group.labelKey)}</p>
              {#each group.items as item (item.section)}
                <button
                  type="button"
                  class={cn('switcher-item', settingsSubpath === item.section && 'is-active')}
                  onclick={() => openSettingsSection(item.section)}
                >
                  {$_(item.labelKey)}
                </button>
              {/each}
            {/each}
          </nav>
          <div class="settings-body">
            <SettingsLayout data={sheet.data as never}>
              {#snippet children()}
                {#if settingsLoader}
                  {#await settingsLoader() then { default: SettingsSectionPage }}
                    <SettingsSectionPage data={sheet.data as never} form={null} />
                  {/await}
                {/if}
              {/snippet}
            </SettingsLayout>
          </div>
        </div>
      {:else if entry.id === 'calendar'}
        <CalendarPage data={sheet.data as never} />
      {:else if entry.id === 'ads'}
        <AdsSocialPage data={sheet.data as never} form={null} />
      {/if}
    </Sheet.Content>
  </Sheet.Root>
{/if}

<style>
  :global(.canvas-sheet) {
    inset: 3vh 3vw !important;
    width: auto !important;
    max-width: none !important;
    height: auto !important;
    border-radius: 0 !important;
  }

  .settings-shell {
    display: flex;
    height: 100%;
    min-height: 0;
  }

  .settings-switcher {
    flex: 0 0 200px;
    overflow-y: auto;
    border-right: 1px solid var(--line, #ededef);
    padding: 40px 10px 16px;
  }

  .switcher-group {
    margin: 14px 0 4px;
    padding: 0 6px;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-faint, #9a9a9e);
  }
  .switcher-group:first-child {
    margin-top: 0;
  }

  .switcher-item {
    display: block;
    width: 100%;
    text-align: left;
    appearance: none;
    border: 0;
    background: transparent;
    padding: 6px;
    font: inherit;
    font-size: 13px;
    color: var(--ink, #1d1d1f);
    cursor: pointer;
  }
  .switcher-item:hover {
    background: var(--paper-2, #f9f9f9);
  }
  .switcher-item.is-active {
    background: var(--nav-on, color-mix(in srgb, var(--accent) 12%, transparent));
    font-weight: 600;
  }

  .settings-body {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 40px 32px;
  }
</style>
