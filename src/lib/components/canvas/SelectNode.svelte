<script lang="ts">
  /**
   * IL NODO `select`: sceglie UN item da una `list` a monte, per indice 1-based — la stessa cifra
   * sul nodo e sul thumbnail cliccato (CLAUDE.md, il disegno concordato). `list` arriva da fuori,
   * già risolta dalla pagina (`listFeedingSelect`, la stessa disciplina di `upstream.ts` lato
   * server): `null` quando nessun arco porta a una `list`, e in quel caso non c'è niente da
   * mostrare oltre il numero scritto a mano.
   */
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ImageIcon from '@lucide/svelte/icons/image';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import { clampIndex, type SelectNode } from '$lib/canvas/select-node';
  import { listLabel, type ListNode } from '$lib/canvas/list-node';
  import { requestGuide } from '$lib/canvas/guide-open';

  let {
    node,
    list = null,
    onchange
  }: {
    node: SelectNode;
    list?: ListNode | null;
    onchange?: (patch: Partial<SelectNode>) => void;
  } = $props();

  const length = $derived(list?.items.length ?? 0);
  const current = $derived(list && length ? list.items[Math.min(node.index, length) - 1] : null);

  function setIndex(next: number) {
    onchange?.({ index: clampIndex(next, length) });
  }

  function prev() {
    setIndex(node.index - 1);
  }
  function next() {
    setIndex(node.index + 1);
  }
</script>

<div class="select">
  <header class="select-head">
    <button type="button" class="select-nav" onclick={prev} disabled={!length || node.index <= 1} aria-label="Precedente">
      <ChevronLeft size={14} strokeWidth={2} />
    </button>

    <input
      class="select-index"
      type="number"
      min="1"
      value={node.index}
      oninput={(e) => setIndex(Number(e.currentTarget.value))}
      aria-label="Indice"
    />
    {#if length}
      <span class="select-total">/ {length}</span>
    {/if}

    <button type="button" class="select-nav" onclick={next} disabled={!length || node.index >= length} aria-label="Successivo">
      <ChevronRight size={14} strokeWidth={2} />
    </button>

    <button type="button" class="select-help" onclick={() => requestGuide('loop')} aria-label="Guida">
      <HelpCircle size={13} strokeWidth={2} />
    </button>
  </header>

  <div class="select-body">
    {#if !list}
      <p class="select-empty">
        Sceglie un elemento da una lista collegata, per numero.<br />Collega una lista
      </p>
    {:else if !length}
      <p class="select-empty">Lista vuota</p>
    {:else if current}
      {#if list.itemKind === 'image' && current.url}
        <img class="select-photo" src={current.url} alt={listLabel(current, node.index - 1)} loading="lazy" />
      {:else if list.itemKind === 'image'}
        <div class="select-photo select-photo-empty"><ImageIcon size={22} strokeWidth={1.5} /></div>
      {:else}
        <p class="select-text">{current.text ?? listLabel(current, node.index - 1)}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .select {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #e5e5e5);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.05),
      0 8px 24px -12px rgb(0 0 0 / 0.2);
    overflow: hidden;
    transition: box-shadow 140ms ease;
  }
  .select:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .select {
      transition: none;
    }
  }

  .select-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line, #e5e5e5);
  }

  .select-nav {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: 1px solid var(--line-2, #d2d2d7);
    cursor: pointer;
  }
  .select-nav:hover:not(:disabled) {
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }
  .select-nav:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .select-help {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-left: auto;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: none;
    cursor: pointer;
  }
  .select-help:hover {
    color: var(--ink, #1d1d1f);
  }

  .select-index {
    width: 44px;
    padding: 2px 5px;
    font: inherit;
    font-size: 12px;
    text-align: center;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }
  .select-total {
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
  }

  .select-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .select-empty {
    margin: 0;
    padding: 10px;
    font-size: 11.5px;
    color: var(--ink-soft, #6e6e73);
    text-align: center;
  }

  .select-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--paper-2, #f9f9f9);
  }
  .select-photo-empty {
    display: grid;
    place-content: center;
    color: var(--ink-soft, #6e6e73);
  }

  .select-text {
    margin: 0;
    padding: 12px;
    font-size: 12.5px;
    color: var(--ink, #1d1d1f);
    white-space: pre-wrap;
    overflow: auto;
  }
</style>
