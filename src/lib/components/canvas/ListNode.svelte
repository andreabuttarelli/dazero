<script lang="ts">
  /**
   * IL NODO `list`: N valori, immagini O testo. Nasce vuoto — si riempie trascinando asset sopra
   * (lo stesso `CANVAS_DRAG_FILLED_NODE` che l'aggiunge alla tela, letto qui invece che sulla
   * tela intera) o scrivendo righe di testo — o già pieno, come output di un loop
   * (`loop.ts::createOutputList`): in quel caso ogni item porta uno `status` che questo componente
   * mostra, e la realtime su `nodes` lo tiene fresco da sola (`onChange` → `refresh()` nella
   * pagina, nessun codice in più qui).
   */
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Plus from '@lucide/svelte/icons/plus';
  import Loader from '@lucide/svelte/icons/loader';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import Clock from '@lucide/svelte/icons/clock';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import {
    addImageItem,
    addTextLines,
    listLabel,
    removeItemAt,
    reorderItem,
    type ListItem,
    type ListNode
  } from '$lib/canvas/list-node';
  import { CANVAS_DRAG_FILLED_NODE, parseFilledNodeDrag } from '$lib/canvas/drag-payload';
  import { scrollGuard } from '$lib/canvas/scroll-guard';
  import { requestGuide } from '$lib/canvas/guide-open';

  let {
    node,
    onchange,
    onretry
  }: {
    node: ListNode;
    onchange?: (patch: Partial<ListNode>) => void;
    /** Ritenta UN item fallito, subito — `loop.ts::retryLoopCombination`, non in coda: assente
     *  finché non c'è una scrittura server da chiamare (la pagina lo passa solo per liste che
     *  sono output di un loop). */
    onretry?: (index: number) => void;
  } = $props();

  let textDraft = $state('');
  let dragOver = $state(false);

  function commitPatch(next: ListNode) {
    onchange?.({ itemKind: next.itemKind, items: next.items });
  }

  function onDrop(e: DragEvent) {
    dragOver = false;
    const raw = e.dataTransfer?.getData(CANVAS_DRAG_FILLED_NODE);
    if (!raw) return;

    const drag = parseFilledNodeDrag(raw);
    if (!drag) return;

    e.preventDefault();
    e.stopPropagation();

    if (drag.type === 'image') {
      const assetId = typeof drag.data.assetId === 'string' ? drag.data.assetId : '';
      const url = typeof drag.data.url === 'string' ? drag.data.url : '';
      const name = typeof drag.data.name === 'string' ? drag.data.name : undefined;
      if (assetId && url) {
        commitPatch(addImageItem(node, { assetId, url, label: name }));
      }
      return;
    }

    if (drag.type === 'text') {
      const prompt = typeof drag.data.prompt === 'string' ? drag.data.prompt : '';
      if (prompt.trim()) {
        commitPatch(addTextLines(node, prompt));
      }
    }
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(CANVAS_DRAG_FILLED_NODE)) return;
    e.preventDefault();
    e.stopPropagation();
    dragOver = true;
  }

  function addTextDraft() {
    if (!textDraft.trim()) return;
    commitPatch(addTextLines(node, textDraft));
    textDraft = '';
  }

  function remove(index: number) {
    commitPatch(removeItemAt(node, index));
  }

  let dragFrom = $state<number | null>(null);

  function onItemDragStart(index: number) {
    dragFrom = index;
  }

  function onItemDrop(index: number) {
    if (dragFrom === null) return;
    commitPatch(reorderItem(node, dragFrom, index));
    dragFrom = null;
  }

  const STATUS_ICON = { queued: Clock, running: Loader, done: Check, failed: X } as const;
</script>

<div
  class="list"
  class:drag-over={dragOver}
  ondrop={onDrop}
  ondragover={onDragOver}
  ondragleave={() => (dragOver = false)}
  role="list"
>
  <header class="list-head">
    <span class="list-kind">{node.itemKind === 'text' ? 'Testo' : 'Immagini'}</span>
    <span class="list-head-right">
      <span class="list-count">{node.items.length}</span>
      <button type="button" class="list-help" onclick={() => requestGuide('loop')} aria-label="Guida">
        <HelpCircle size={13} strokeWidth={2} />
      </button>
    </span>
  </header>

  <div class="list-body" use:scrollGuard>
    {#if !node.items.length}
      <p class="list-empty">
        {dragOver
          ? 'Rilascia per aggiungere'
          : 'Trascina qui immagini o scrivi una riga per elemento: ogni elemento è un giro del Loop'}
      </p>
    {:else}
      <ol class="list-items">
        {#each node.items as item, index (index)}
          <li
            class="list-item"
            draggable="true"
            ondragstart={() => onItemDragStart(index)}
            ondragover={(e) => e.preventDefault()}
            ondrop={() => onItemDrop(index)}
          >
            <span class="list-item-index">{index + 1}</span>

            {#if node.itemKind === 'image' && item.url}
              <img class="list-item-thumb" src={item.url} alt={listLabel(item, index)} loading="lazy" />
            {:else}
              <span class="list-item-text">{item.text ?? listLabel(item, index)}</span>
            {/if}

            {#if item.status}
              {@const StatusIcon = STATUS_ICON[item.status]}
              <span class="list-item-status list-item-status-{item.status}" title={item.status}>
                <StatusIcon size={12} strokeWidth={2} class={item.status === 'running' ? 'is-spinning' : ''} />
              </span>
            {/if}

            {#if item.status === 'failed' && onretry}
              <button type="button" class="list-item-retry" onclick={() => onretry?.(index)} aria-label="Ritenta">
                <RotateCw size={12} strokeWidth={2} />
              </button>
            {/if}

            <button type="button" class="list-item-remove" onclick={() => remove(index)} aria-label="Togli">
              <Trash2 size={12} strokeWidth={2} />
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>

  {#if node.itemKind !== 'image' || !node.items.length}
    <form class="list-add" onsubmit={(e) => { e.preventDefault(); addTextDraft(); }}>
      <input
        class="list-add-input"
        type="text"
        placeholder="Aggiungi una riga…"
        bind:value={textDraft}
        aria-label="Nuova riga di testo"
      />
      <button type="submit" class="list-add-btn" aria-label="Aggiungi" disabled={!textDraft.trim()}>
        <Plus size={13} strokeWidth={2} />
      </button>
    </form>
  {/if}
</div>

<style>
  .list {
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
    transition: box-shadow 140ms ease, border-color 140ms ease;
  }
  .list:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  .list.drag-over {
    border-color: var(--accent, #7c5cff);
  }
  @media (prefers-reduced-motion: reduce) {
    .list {
      transition: none;
    }
  }

  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 9px;
    border-bottom: 1px solid var(--line, #e5e5e5);
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
  }
  .list-kind {
    font-weight: 600;
    color: var(--ink, #1d1d1f);
  }

  .list-head-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .list-help {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: none;
    cursor: pointer;
  }
  .list-help:hover {
    color: var(--ink, #1d1d1f);
  }

  .list-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .list-empty {
    margin: 0;
    padding: 16px 10px;
    font-size: 11.5px;
    color: var(--ink-soft, #6e6e73);
    text-align: center;
  }

  .list-items {
    margin: 0;
    padding: 4px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    cursor: grab;
  }
  .list-item:active {
    cursor: grabbing;
  }

  .list-item-index {
    flex: none;
    min-width: 16px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--ink-soft, #6e6e73);
    text-align: center;
  }

  .list-item-thumb {
    flex: none;
    width: 28px;
    height: 28px;
    object-fit: cover;
    background: var(--paper, #fff);
  }

  .list-item-text {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-item-status {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
  }
  .list-item-status-queued { color: var(--ink-soft, #6e6e73); }
  .list-item-status-running { color: var(--accent, #7c5cff); }
  .list-item-status-done { color: #16a34a; }
  .list-item-status-failed { color: #c0392b; }
  .list-item-status :global(.is-spinning) {
    animation: list-spin 900ms linear infinite;
  }
  @keyframes list-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .list-item-status :global(.is-spinning) { animation: none; }
  }

  .list-item-retry,
  .list-item-remove {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: none;
    cursor: pointer;
  }
  .list-item-retry:hover,
  .list-item-remove:hover {
    color: var(--ink, #1d1d1f);
    background: var(--paper, #fff);
  }

  .list-add {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
    border-top: 1px solid var(--line, #e5e5e5);
  }
  .list-add-input {
    flex: 1;
    min-width: 0;
    padding: 4px 7px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }
  .list-add-btn {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: 1px solid var(--line-2, #d2d2d7);
    cursor: pointer;
  }
  .list-add-btn:hover:not(:disabled) {
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }
  .list-add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
