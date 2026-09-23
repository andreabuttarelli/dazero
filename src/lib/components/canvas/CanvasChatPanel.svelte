<script lang="ts">
  import { _ } from 'svelte-i18n';
  import ChatPanel from '$lib/components/brand-agent/ChatPanel.svelte';
  import { readChatPanelPx, writeChatPanelPx, CHAT_PANEL } from '$lib/shell-prefs';

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
    <div class="chat-body">
      <ChatPanel {projectId} {brandSlug} />
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

  .chat-body {
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    overflow: hidden;
  }
</style>
