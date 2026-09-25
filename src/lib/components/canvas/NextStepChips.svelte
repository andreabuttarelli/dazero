<script lang="ts">
  /**
   * SUGGERIMENTI FANTASMA SOTTO LA SELEZIONE — un nodo scelto propone il passo dopo, letto dal
   * server (`suggestNextStep`, la tabella di `next-step-actions.ts` più Jev quando c'è).
   * Debounced e cancellato a ogni cambio di selezione: un clic veloce fra nodi diversi non deve
   * far arrivare in ordine sbagliato una risposta partita per un nodo che non è più selezionato.
   */
  import { deserialize } from '$app/forms';

  const SUGGEST_DEBOUNCE_MS = 400;

  type Suggestion = {
    id: string;
    label: string;
    createsNodeType: 'video' | 'text' | 'image' | null;
    wiring: 'connect-new' | 'create-post';
    promptTemplate: string;
    confidence: number;
  };

  let {
    box,
    zoom = 1,
    nodeId,
    onpick
  }: {
    box: { x: number; y: number; width: number } | null;
    zoom?: number;
    /** Il nodo unico selezionato — niente suggerimenti su una selezione multipla. */
    nodeId: string | null;
    onpick?: (suggestion: Suggestion) => void;
  } = $props();

  let suggestions = $state<Suggestion[]>([]);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;

  $effect(() => {
    const id = nodeId;
    if (timer) clearTimeout(timer);
    if (!id) {
      suggestions = [];
      return;
    }

    const thisRequest = ++requestId;
    timer = setTimeout(async () => {
      const body = new FormData();
      body.set('node_id', id);

      try {
        const res = await fetch('?/suggestNextStep', {
          method: 'POST',
          headers: { 'x-sveltekit-action': 'true' },
          body
        });
        if (thisRequest !== requestId) return;

        const result = deserialize(await res.text());
        if (result.type !== 'success') {
          suggestions = [];
          return;
        }
        suggestions = ((result.data as { suggestions?: Suggestion[] } | null)?.suggestions ?? []);
      } catch {
        if (thisRequest === requestId) suggestions = [];
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      if (timer) clearTimeout(timer);
    };
  });
</script>

{#if box && suggestions.length}
  <div
    class="chips"
    style={`left:${box.x + box.width / 2}px; top:${box.y + 40}px; --chips-scale:${zoom}`}
    role="group"
    aria-label="Suggerimenti"
  >
    {#each suggestions as suggestion (suggestion.id)}
      <button type="button" class="chip" onclick={() => onpick?.(suggestion)}>
        {suggestion.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .chips {
    position: fixed;
    z-index: 14;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-width: 260px;
    transform-origin: center top;
    transform: translate(-50%, 0);
  }

  .chip {
    padding: 4px 8px;
    font: inherit;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
    white-space: nowrap;
    cursor: pointer;
    background: var(--paper, #fff);
    border: 1px dashed var(--line-2, #d2d2d7);
    border-radius: 0;
  }
  .chip:hover,
  .chip:focus-visible {
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border-style: solid;
  }
</style>
