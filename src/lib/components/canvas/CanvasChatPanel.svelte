<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { CHROME_LOADERS } from '$lib/canvas/chrome-loaders';
  import { browser } from '$app/environment';
  import { readChatPanelPx, writeChatPanelPx, readChatTab, writeChatTab, CHAT_PANEL, type ChatTab } from '$lib/shell-prefs';
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
          <CanvasGuideTab />
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
    border-left: 1px solid var(--line, #ededef);
    background: var(--paper, #fff);
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
  }

  .chat-column {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .chat-tabs {
    display: flex;
    border-bottom: 1px solid var(--line, #ededef);
    padding: 0 12px;
  }

  .chat-tab {
    padding: 8px 10px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    font: inherit;
    font-weight: 600;
    color: var(--ink-soft, #6e6e73);
    cursor: pointer;
  }

  .chat-tab.is-active {
    color: var(--ink, #111112);
    border-bottom-color: var(--accent, #7c5cff);
  }

  .chat-body {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 10px 12px;
    overflow: auto;
  }
</style>
