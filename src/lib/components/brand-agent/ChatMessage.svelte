<script lang="ts">
  import { toolLabel } from '$lib/chat-parts';

  export type ToolLine = {
    toolCallId?: string;
    toolName: string;
    status?: 'running' | 'done' | 'error';
  };

  let {
    role,
    content,
    pending = false,
    at = null,
    tools = [],
    live = false
  }: {
    role: 'user' | 'assistant';
    content: string;
    pending?: boolean;
    at?: number | null;
    tools?: ToolLine[];
    live?: boolean;
  } = $props();

  const STATUS_WORD: Record<string, string> = {
    running: 'in corso',
    done: 'fatto',
    error: 'errore'
  };

  const time = $derived(at ? new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '');
  const showCaret = $derived(live && !!content);
  const showDots = $derived(pending && !content && !tools.length);
  const showWait = $derived(pending && !content && tools.length > 0);
</script>

{#snippet toolRow(tool: ToolLine)}
  {@const status = tool.status ?? 'running'}
  <div class="tool {status}">
    <span class="pip" aria-hidden="true"></span>
    <span class="tool-name">{toolLabel(tool.toolName)}</span>
    <span class="tool-status">{STATUS_WORD[status] ?? status}</span>
  </div>
{/snippet}

<div class="msg {role}" class:live>
  {#if tools.length}
    <div class="tools" aria-label="azioni del turno">
      {#each tools as tool, i (tool.toolCallId ?? `${tool.toolName}-${i}`)}
        {@render toolRow(tool)}
      {/each}
    </div>
  {/if}

  {#if showDots}
    <div class="bubble assistant-bubble dots" aria-label="sta scrivendo">
      <i></i><i></i><i></i>
    </div>
  {:else if content || showWait}
    <div class="bubble {role}-bubble">
      {content}{#if showCaret}<span class="caret" aria-hidden="true"></span>{/if}
      {#if showWait}<span class="wait">sta scrivendo…</span>{/if}
    </div>
  {/if}

  {#if time && content}
    <time class="meta">{time}</time>
  {/if}
</div>

<style>
  .msg {
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    animation: enter 0.18s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
  }
  .msg.user {
    align-items: flex-end;
  }
  .msg.assistant {
    align-items: flex-start;
  }

  .bubble {
    border: 0;
    max-width: 92%;
    padding: 6px 9px;
    font-size: 12.5px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .user-bubble {
    background: color-mix(in srgb, var(--ink, #1d1d1f) 6%, transparent);
    color: var(--ink, #1d1d1f);
  }
  .assistant-bubble {
    padding: 6px 2px;
    color: var(--ink, #1d1d1f);
  }

  .meta {
    font-size: 10px;
    line-height: 1;
    color: var(--ink-faint, #86868b);
    padding: 0 2px;
  }

  .tools {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 1px 2px 2px;
  }
  .tool {
    display: grid;
    grid-template-columns: 6px minmax(0, 1fr) auto;
    gap: 5px;
    align-items: baseline;
    font-size: 10.5px;
    line-height: 1.3;
    color: var(--ink-soft, #6e6e73);
  }
  .tool-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tool-status {
    color: var(--ink-faint, #86868b);
  }
  .tool.error,
  .tool.error .tool-status {
    color: #c0392b;
  }
  .pip {
    width: 5px;
    height: 5px;
    background: var(--ink-faint, #86868b);
    align-self: center;
  }
  .tool.running .pip {
    background: var(--accent, #c485fe);
    animation: pulse 1.1s ease-in-out infinite;
  }
  .tool.error .pip {
    background: #c0392b;
  }

  .dots {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 8px 10px;
  }
  .dots i {
    width: 4px;
    height: 4px;
    background: var(--ink-soft, #6e6e73);
    animation: blink 1.2s infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.4s;
  }

  .caret {
    display: inline-block;
    width: 5px;
    height: 11px;
    margin-left: 2px;
    vertical-align: -1px;
    background: var(--ink-soft, #6e6e73);
    animation: blink 1s step-end infinite;
  }

  .wait {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--ink-faint, #86868b);
  }

  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes blink {
    0%,
    60%,
    100% {
      opacity: 0.25;
    }
    30% {
      opacity: 1;
    }
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .msg {
      animation: none;
    }
    .dots i,
    .caret,
    .tool.running .pip {
      animation: none;
      opacity: 0.55;
    }
  }
</style>
