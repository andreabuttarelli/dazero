<script lang="ts">
  let {
    value = $bindable(),
    busy = false,
    enabled = true,
    onsend,
    onstop
  }: {
    value: string;
    busy?: boolean;
    enabled?: boolean;
    onsend: () => void;
    onstop: () => void;
  } = $props();

  let el = $state<HTMLTextAreaElement | null>(null);

  function grow() {
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  $effect(() => {
    void value;
    grow();
  });

  function onKeydown(e: KeyboardEvent) {
    // isComposing: Invio durante un IME conferma la composizione, non manda.
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) {
      return;
    }
    e.preventDefault();
    if (!busy && enabled && value.trim()) {
      onsend();
    }
  }

  function submit() {
    if (!busy && enabled && value.trim()) {
      onsend();
    }
  }
</script>

<div class="composer" class:focusable={enabled && !busy}>
  <textarea
    bind:this={el}
    bind:value
    onkeydown={onKeydown}
    rows="1"
    placeholder="Scrivi un messaggio…"
    disabled={busy || !enabled}
  ></textarea>

  {#if busy}
    <button type="button" class="act stop" onclick={onstop} aria-label="Interrompi">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <rect x="3.5" y="3.5" width="9" height="9" fill="currentColor" />
      </svg>
    </button>
  {:else}
    <button type="button" class="act send" onclick={submit} disabled={!value.trim() || !enabled} aria-label="Invia">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M1.7 7.3 13.2 2a.6.6 0 0 1 .8.8L8.7 14.3a.6.6 0 0 1-1.1-.1L6.4 9.6 1.8 8.4a.6.6 0 0 1-.1-1.1Z"
        />
      </svg>
    </button>
  {/if}
</div>

<style>
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 5px;
    padding: 5px 5px 5px 8px;
    border: 1px solid var(--line-2, #d2d2d7);
    background: var(--paper, #fff);
    transition: border-color 0.14s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
  }
  .composer.focusable:focus-within {
    border-color: var(--accent, #c485fe);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #c485fe) 18%, transparent);
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
    font-size: 12.5px;
    line-height: 1.4;
    max-height: 120px;
    padding: 4px 0;
  }
  textarea::placeholder {
    color: var(--ink-faint, #86868b);
  }
  textarea:disabled {
    opacity: 0.55;
  }

  .act {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    cursor: pointer;
    transition: opacity 0.14s ease, transform 0.14s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
  }
  .send {
    background: var(--ink, #1d1d1f);
    color: var(--paper, #fff);
  }
  .stop {
    background: color-mix(in srgb, var(--ink, #1d1d1f) 10%, transparent);
    color: var(--ink, #1d1d1f);
  }
  .act:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .act:not(:disabled):hover {
    transform: translateY(-1px);
  }
  .act:focus-visible {
    outline: 2px solid var(--accent, #c485fe);
    outline-offset: 1px;
  }

  :global(:root[data-theme='dark']) .composer {
    background: var(--paper-2, #181818);
    border-color: var(--line, #222);
  }
  :global(:root[data-theme='dark']) .send {
    background: #fff;
    color: #000;
  }
  :global(:root[data-theme='dark']) .stop {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  @media (prefers-reduced-motion: reduce) {
    .act:not(:disabled):hover {
      transform: none;
    }
  }
</style>
