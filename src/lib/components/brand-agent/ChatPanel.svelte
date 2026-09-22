<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/stores';
  import { applyChatStreamEvent, closeDanglingToolCalls, emptyStreamState, readSseEvents } from '$lib/chat-stream-events';
  import { nearBottom } from '$lib/chat-scroll';
  import { chatEndpoint } from './chat-endpoint';
  import ChatComposer from './ChatComposer.svelte';
  import ChatMessage, { type ToolLine } from './ChatMessage.svelte';

  let {
    brandSlug = '',
    projectId = ''
  }: { brandSlug?: string; projectId?: string } = $props();

  type Failure = 'load' | 'send' | 'empty';
  type Message = {
    role: 'user' | 'assistant';
    content: string;
    pending?: boolean;
    at?: number | null;
    tools?: ToolLine[];
    live?: boolean;
  };

  let messages = $state<Message[]>([]);
  let draft = $state('');
  let sending = $state(false);
  let loading = $state(true);
  let failed = $state<Failure | ''>('');
  let scroller = $state<HTMLDivElement | null>(null);
  let abort: AbortController | null = null;
  let stick = true;

  const routeProjectId = $derived($page.params.projectId ?? '');
  const endpoint = $derived(
    chatEndpoint({ projectId: projectId || routeProjectId, brandSlug })
  );
  const hasScope = $derived(!!endpoint);

  function onScroll() {
    stick = nearBottom(scroller);
  }

  async function scrollToEnd(force = false) {
    await tick();
    if (!scroller || (!force && !stick)) {
      return;
    }
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: force ? 'smooth' : 'auto' });
  }

  async function load() {
    if (!endpoint) {
      loading = false;
      messages = [];
      failed = '';
      return;
    }

    loading = true;
    failed = '';

    try {
      const res = await fetch(endpoint);
      // Nessun thread ancora: la conversazione è vuota, non rotta.
      if (res.status === 404) {
        messages = [];
        return;
      }
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const data = (await res.json()) as { messages?: Message[] };
      messages = data.messages ?? [];
      stick = true;
      await scrollToEnd(true);
    } catch {
      failed = 'load';
    } finally {
      loading = false;
    }
  }

  // Un thread per ambito: al mount si riapre quello che c'è già, quindi ricaricare la pagina
  // riporta nella stessa conversazione invece di aprirne una nuova.
  $effect(() => {
    void endpoint;
    void load();
  });

  function visibleTools(tools: ToolLine[]): ToolLine[] {
    return tools.filter((t) => t.toolName !== 'reply');
  }

  function liveIndex() {
    return messages.length - 1;
  }

  function foldLive(state: ReturnType<typeof emptyStreamState>) {
    const last = messages[liveIndex()];
    if (!last || last.role !== 'assistant') {
      return;
    }
    last.content = state.text;
    last.pending = false;
    last.live = true;
    last.tools = visibleTools(
      state.tools.map((t) => ({ toolCallId: t.toolCallId, toolName: t.toolName, status: t.status }))
    );
  }

  function dropLive() {
    messages = messages.slice(0, -1);
  }

  async function send(text: string, appendUser: boolean) {
    if (!text || sending || !endpoint) {
      return;
    }

    failed = '';
    sending = true;
    abort = new AbortController();

    if (appendUser) {
      draft = '';
      messages = [...messages, { role: 'user', content: text, at: Date.now() }];
    }

    messages = [
      ...messages,
      { role: 'assistant', content: '', pending: true, at: Date.now(), tools: [], live: true }
    ];
    stick = true;
    await scrollToEnd(true);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: abort.signal
      });

      if (!res.ok || !res.body) {
        throw new Error(String(res.status));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const state = emptyStreamState();
      let buffered = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffered += decoder.decode(value, { stream: true });
        const { events, rest } = readSseEvents(buffered);
        buffered = rest;

        for (const evt of events) {
          if (!applyChatStreamEvent(state, evt)) {
            continue;
          }
          foldLive(state);
        }

        void scrollToEnd();
      }

      closeDanglingToolCalls(state);
      foldLive(state);
      const done = messages[liveIndex()];
      if (done?.role === 'assistant') {
        done.live = false;
      }

      if (!done?.content) {
        dropLive();
        failed = 'empty';
      }
    } catch (e) {
      const aborted = (e as Error | undefined)?.name === 'AbortError';
      const partial = messages[liveIndex()];
      const textKept = partial?.role === 'assistant' ? partial.content : '';

      dropLive();

      if (aborted) {
        if (textKept) {
          messages = [...messages, { role: 'assistant', content: textKept, at: Date.now(), tools: [] }];
        }
      } else {
        failed = 'send';
      }
    } finally {
      sending = false;
      abort = null;
      await scrollToEnd(true);
    }
  }

  function retry() {
    if (failed === 'load') {
      void load();
      return;
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      void send(lastUser.content, false);
    }
  }

  function stop() {
    abort?.abort();
  }
</script>

<div class="panel">
  {#if !hasScope}
    <p class="empty">Seleziona un progetto per iniziare.</p>
  {:else}
    <div class="scroll" bind:this={scroller} onscroll={onScroll}>
      {#if loading}
        <div class="shimmer" aria-hidden="true">
          <span class="s1"></span>
          <span class="s2"></span>
          <span class="s3"></span>
        </div>
      {:else if failed === 'load'}
        <div class="state">
          <p class="hint">Non riesco a leggere la conversazione.</p>
          <button type="button" class="retry" onclick={retry}>Riprova</button>
        </div>
      {:else if !messages.length}
        <p class="empty">Chiedi qualcosa su questo progetto.</p>
      {/if}

      {#each messages as message, i (i)}
        <ChatMessage
          role={message.role}
          content={message.content}
          pending={message.pending}
          at={message.at}
          tools={message.tools}
          live={message.live}
        />
      {/each}

      {#if failed === 'send' || failed === 'empty'}
        <div class="state inline">
          <p class="hint err">
            {failed === 'empty' ? 'Risposta vuota.' : 'Non è arrivata risposta.'}
          </p>
          <button type="button" class="retry" onclick={retry}>Riprova</button>
        </div>
      {/if}
    </div>

    <ChatComposer bind:value={draft} busy={sending} enabled={hasScope && !loading} onsend={() => void send(draft.trim(), true)} onstop={stop} />
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 8px;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 2px 0 4px;
    scrollbar-width: thin;
  }

  .empty {
    margin: auto 0;
    text-align: center;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--ink-soft, #6e6e73);
    padding: 12px 6px;
  }

  .state {
    margin: auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px 4px;
  }
  .state.inline {
    margin: 4px 0 0;
    flex-direction: row;
    justify-content: center;
    gap: 6px;
  }

  .hint {
    margin: 0;
    text-align: center;
    font-size: 12px;
    line-height: 1.4;
    color: var(--ink-soft, #6e6e73);
  }
  .hint.err {
    color: var(--ink, #1d1d1f);
  }

  .retry {
    appearance: none;
    border: 1px solid var(--line-2, #d2d2d7);
    background: var(--paper, #fff);
    color: var(--ink, #1d1d1f);
    border-radius: 7px;
    padding: 3px 9px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.14s ease;
  }
  .retry:hover {
    background: var(--paper-2, #f9f9f9);
  }
  .retry:focus-visible {
    outline: 2px solid var(--accent, #c485fe);
    outline-offset: 1px;
  }

  .shimmer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 2px;
  }
  .shimmer span {
    display: block;
    height: 28px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--ink) 4%, var(--paper)) 0%,
      color-mix(in srgb, var(--ink) 9%, var(--paper)) 45%,
      color-mix(in srgb, var(--ink) 4%, var(--paper)) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.35s ease-in-out infinite;
  }
  .shimmer .s1 {
    width: 72%;
    align-self: flex-end;
  }
  .shimmer .s2 {
    width: 88%;
  }
  .shimmer .s3 {
    width: 54%;
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shimmer span {
      animation: none;
    }
  }
</style>
