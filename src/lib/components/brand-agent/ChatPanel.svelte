<script lang="ts">
  import { tick } from 'svelte';
  import { applyChatStreamEvent, emptyStreamState, readSseEvents } from '$lib/chat-stream-events';

  let { brandSlug }: { brandSlug: string } = $props();

  type Message = { role: 'user' | 'assistant'; content: string; pending?: boolean };

  let messages = $state<Message[]>([]);
  let draft = $state('');
  let sending = $state(false);
  let loading = $state(true);
  let failed = $state('');
  let scroller = $state<HTMLDivElement | null>(null);
  let composer = $state<HTMLTextAreaElement | null>(null);

  const endpoint = $derived(`/api/v1/brands/${brandSlug}/agent`);

  async function scrollToEnd() {
    await tick();
    scroller?.scrollTo({ top: scroller.scrollHeight });
  }

  // Un thread per brand: al mount si riapre quello che c'è già, quindi ricaricare la pagina
  // riporta nella stessa conversazione invece di aprirne una nuova.
  $effect(() => {
    const url = endpoint;
    loading = true;

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { messages?: Message[] }) => {
        messages = data.messages ?? [];
        void scrollToEnd();
      })
      .catch(() => (failed = 'load'))
      .finally(() => (loading = false));
  });

  function grow() {
    if (!composer) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, 160)}px`;
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    draft = '';
    failed = '';
    sending = true;
    messages = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '', pending: true }];
    await tick();
    grow();
    void scrollToEnd();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!res.ok || !res.body) throw new Error(String(res.status));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const state = emptyStreamState();
      let buffered = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffered += decoder.decode(value, { stream: true });
        const { events, rest } = readSseEvents(buffered);
        buffered = rest;

        for (const evt of events) {
          if (!applyChatStreamEvent(state, evt)) continue;

          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            last.content = state.text;
            last.pending = false;
          }
        }

        void scrollToEnd();
      }

      const last = messages[messages.length - 1];
      if (last?.role === 'assistant' && !last.content) {
        messages = messages.slice(0, -1);
        failed = 'empty';
      }
    } catch {
      messages = messages.slice(0, -1);
      failed = 'send';
    } finally {
      sending = false;
      void scrollToEnd();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    // Invio manda, Shift+Invio va a capo: la convenzione che ogni chat usa, e che chi scrive
    // si aspetta senza doverla scoprire.
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    void send();
  }
</script>

<div class="panel">
  <div class="scroll" bind:this={scroller}>
    {#if loading}
      <p class="hint">…</p>
    {:else if !messages.length}
      <p class="hint">Chiedi qualcosa sul brand.</p>
    {/if}

    {#each messages as message, i (i)}
      <div class="turn {message.role}">
        {#if message.pending && !message.content}
          <span class="dots" aria-label="sta scrivendo"><i></i><i></i><i></i></span>
        {:else}
          {message.content}
        {/if}
      </div>
    {/each}

    {#if failed}
      <p class="failed">
        {failed === 'load' ? 'Non riesco a leggere la conversazione.' : 'Non è arrivata risposta.'}
      </p>
    {/if}
  </div>

  <div class="composer">
    <textarea
      bind:this={composer}
      bind:value={draft}
      oninput={grow}
      onkeydown={onKeydown}
      rows="1"
      placeholder="Scrivi…"
      disabled={sending}
    ></textarea>
    <button type="button" onclick={send} disabled={!draft.trim() || sending} aria-label="Invia">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path fill="currentColor" d="M1.7 7.3 13.2 2a.6.6 0 0 1 .8.8L8.7 14.3a.6.6 0 0 1-1.1-.1L6.4 9.6 1.8 8.4a.6.6 0 0 1-.1-1.1Z" />
      </svg>
    </button>
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 2px 10px;
    scrollbar-width: thin;
  }
  .hint,
  .failed {
    margin: auto 0;
    text-align: center;
    font-size: 12.5px;
    color: var(--ink-soft, #6e6e73);
  }
  .failed {
    margin: 0;
    color: #c0392b;
  }
  .turn {
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border-radius: 12px;
  }
  .turn.user {
    align-self: flex-end;
    max-width: 88%;
    padding: 7px 11px;
    background: var(--accent, #7c5cff);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .turn.assistant {
    align-self: stretch;
    color: var(--ink, #1d1d1f);
  }
  .dots {
    display: inline-flex;
    gap: 3px;
    padding: 4px 0;
  }
  .dots i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--ink-soft, #6e6e73);
    animation: blink 1.2s infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes blink {
    0%, 60%, 100% {
      opacity: 0.25;
    }
    30% {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dots i {
      animation: none;
      opacity: 0.5;
    }
  }
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 6px;
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 12px;
    background: var(--paper, #fff);
  }
  textarea {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--ink, #1d1d1f);
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
    max-height: 160px;
  }
  .composer:focus-within {
    border-color: var(--accent, #7c5cff);
  }
  button {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 8px;
    background: var(--ink, #1d1d1f);
    color: var(--paper, #fff);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  :global(:root[data-theme='dark']) .composer {
    background: var(--paper-2, #111);
    border-color: var(--line, #2a2a2a);
  }
  :global(:root[data-theme='dark']) button {
    background: #fff;
    color: #000;
  }
</style>
