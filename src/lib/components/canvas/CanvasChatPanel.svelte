<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { CHROME_LOADERS } from '$lib/canvas/chrome-loaders';
  import { browser } from '$app/environment';
  import { readChatPanelPx, writeChatPanelPx, readChatTab, writeChatTab, CHAT_PANEL, type ChatTab } from '$lib/shell-prefs';
  import { guideOpenRequest } from '$lib/canvas/guide-open';
  import CanvasGuideTab from './CanvasGuideTab.svelte';

  /**
   * LA CHAT A DESTRA: ridimensionabile trascinando il bordo sinistro, richiudibile a bottone —
   * la larghezza sopravvive alla navigazione come già fa la sidebar (`shell-prefs.ts`).
   */
  let {
    projectId,
    brandSlug,
    open
  }: {
    projectId: string;
    brandSlug: string;
    open: boolean;
  } = $props();

  let widthPx = $state(readChatPanelPx());
  let tab = $state<ChatTab>(readChatTab());

  function selectTab(next: ChatTab) {
    tab = next;
    writeChatTab(next);
  }

  $effect(() => {
    if ($guideOpenRequest) selectTab('guide');
  });

  function onResizeStart(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthPx;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const next = startW - (ev.clientX - startX);
      widthPx = Math.min(CHAT_PANEL.MAX, Math.max(CHAT_PANEL.MIN, Math.round(next)));
    };
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      writeChatPanelPx(widthPx);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }
</script>

{#if open}
  <div class="chat-pane" style={`width: ${widthPx}px;`}>
    <div
      class="chat-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={$_('app.shell.resizeChat')}
      tabindex="0"
      onpointerdown={onResizeStart}
    ></div>
    <div class="chat-column">
      <nav class="chat-tabs" aria-label={$_('app.shell.rail')}>
        <button type="button" class="chat-tab" class:is-active={tab === 'chat'} onclick={() => selectTab('chat')}>
          {$_('app.shell.chatTab')}
        </button>
        <button type="button" class="chat-tab" class:is-active={tab === 'guide'} onclick={() => selectTab('guide')}>
          {$_('app.shell.guideTab')}
        </button>
      </nav>
      <div class="chat-body">
        {#if tab === 'guide'}
          <CanvasGuideTab initialSlug={$guideOpenRequest} onopened={() => guideOpenRequest.set(null)} />
        {:else if browser}
          {#await CHROME_LOADERS.chat() then { default: ChatPanel }}
            <ChatPanel {projectId} {brandSlug} />
          {/await}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .chat-pane {
    position: relative;
    flex: 0 0 auto;
    height: 100%;
    min-height: 0;
    display: flex;
    background: var(--paper-2, #f9f9f9);
  }

  .chat-resize-handle {
    position: absolute;
    left: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    touch-action: none;
    background: transparent;
    transition: background 0.14s ease;
  }

  .chat-resize-handle:hover {
    background: color-mix(in srgb, var(--ink, #1d1d1f) 12%, transparent);
  }

  .chat-column {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .chat-tabs {
    display: flex;
    gap: 4px;
    padding: 10px 12px 6px;
  }

  .chat-tab {
    padding: 4px 6px;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink-soft, #6e6e73);
    cursor: pointer;
  }

  .chat-tab.is-active {
    color: var(--ink, #111112);
    font-weight: 700;
  }

  .chat-body {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 10px 12px;
    overflow: auto;
  }
</style>
