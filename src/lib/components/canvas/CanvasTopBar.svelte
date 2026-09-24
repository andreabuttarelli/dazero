<script lang="ts">
  import { _ } from 'svelte-i18n';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { cn } from '$lib/utils';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Check from '@lucide/svelte/icons/check';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Plus from '@lucide/svelte/icons/plus';

  type ProjectRow = { id: string; name: string; href: string };
  type CanvasRow = { id: string; name: string; href: string };

  /**
   * IL SELETTORE IN ALTO A SINISTRA: `[Project ▾ / Canvas ▾]`. Due menu indipendenti, non uno
   * annidato — cambiare progetto e cambiare tela sono due decisioni diverse, e un progetto nuovo
   * non deve costringere a scegliere anche una tela nella stessa tendina.
   */
  let {
    projectName,
    projects,
    canvasName,
    canvases,
    creditBalance,
    chatOpen,
    onToggleChat
  }: {
    projectName: string;
    projects: ProjectRow[];
    canvasName: string;
    canvases: CanvasRow[];
    creditBalance: number;
    chatOpen: boolean;
    onToggleChat: () => void;
  } = $props();
</script>

<header class="canvas-topbar">
  <div class="topbar-row">
    <div class="switchers">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class="switcher-btn">
          <span class="truncate">{projectName}</span>
          <ChevronDown size={13} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-64">
          {#each projects as project (project.id)}
            <DropdownMenu.Item>
              {#snippet child({ props })}
                <a {...props} href={project.href} class="switcher-row">
                  <span class="truncate">{project.name}</span>
                  {#if project.name === projectName}
                    <Check size={14} />
                  {/if}
                </a>
              {/snippet}
            </DropdownMenu.Item>
          {/each}
          <DropdownMenu.Separator />
          <DropdownMenu.Item>
            {#snippet child({ props })}
              <a {...props} href="/app" class="switcher-row">
                <Plus size={14} />
                <span>{$_('app.brands.newBrand')}</span>
              </a>
            {/snippet}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <span class="sep">/</span>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger class="switcher-btn">
          <span class="truncate">{canvasName}</span>
          <ChevronDown size={13} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-64">
          {#each canvases as canvas (canvas.id)}
            <DropdownMenu.Item>
              {#snippet child({ props })}
                <a {...props} href={canvas.href} class="switcher-row">
                  <span class="truncate">{canvas.name}</span>
                  {#if canvas.name === canvasName}
                    <Check size={14} />
                  {/if}
                </a>
              {/snippet}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>

    <button
      type="button"
      class={cn('chat-toggle', chatOpen && 'is-active')}
      aria-pressed={chatOpen}
      aria-label={$_(chatOpen ? 'app.shell.collapseChat' : 'app.shell.expandChat')}
      onclick={onToggleChat}
    >
      <MessageSquare size={16} />
    </button>
  </div>

  <a href="/app/billing" class="credits">
    {$_('app.shell.credits', { values: { count: creditBalance.toLocaleString() } })}
  </a>
</header>

<style>
  .canvas-topbar {
    position: absolute;
    z-index: 20;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    pointer-events: none;
  }

  .topbar-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 44px;
  }

  .switchers {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    pointer-events: auto;
  }

  .sep {
    color: var(--ink-faint, #9a9a9e);
  }

  :global(.switcher-btn) {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 220px;
    appearance: none;
    border: 0;
    background: transparent;
    padding: 5px 6px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink, #1d1d1f);
    cursor: pointer;
  }
  :global(.switcher-btn:hover) {
    background: var(--paper-2, #f9f9f9);
  }

  .switcher-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    text-decoration: none;
    color: inherit;
  }

  .chat-toggle {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    appearance: none;
    border: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
    color: var(--ink-soft, #6e6e73);
    cursor: pointer;
    pointer-events: auto;
  }
  .chat-toggle:hover {
    background: var(--paper-2, #f9f9f9);
  }
  .chat-toggle.is-active {
    background: var(--nav-on, color-mix(in srgb, var(--accent) 12%, transparent));
    color: var(--accent-ink, var(--accent, #7c5cff));
  }

  .credits {
    pointer-events: auto;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-soft, #6e6e73);
    background: var(--paper, #fff);
    border: 1px solid var(--line, #ededef);
    text-decoration: none;
  }
  .credits:hover {
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }
</style>
