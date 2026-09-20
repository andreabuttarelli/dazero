<script lang="ts">
  type Segment = { value: string; label: string };

  let {
    segments,
    value = $bindable(),
    ariaLabel
  }: { segments: Segment[]; value: string; ariaLabel: string } = $props();

  let container = $state<HTMLDivElement | null>(null);

  // Frecce per muoversi fra i segmenti: è ciò che distingue un tablist da tre bottoni affiancati,
  // e senza cui chi naviga da tastiera deve uscire e rientrare dal gruppo per cambiare pannello.
  function onKeydown(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;

    e.preventDefault();
    const index = segments.findIndex((s) => s.value === value);
    const next = segments[(index + step + segments.length) % segments.length];
    value = next.value;

    container?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  }
</script>

<div class="seg" role="tablist" aria-label={ariaLabel} bind:this={container} onkeydown={onKeydown}>
  {#each segments as segment (segment.value)}
    <button
      type="button"
      role="tab"
      data-value={segment.value}
      aria-selected={value === segment.value}
      tabindex={value === segment.value ? 0 : -1}
      class:active={value === segment.value}
      onclick={() => (value = segment.value)}
    >
      {segment.label}
    </button>
  {/each}
</div>

<style>
  /* Sta su una riga già occupata dal marchio: piccolo per scelta, non per svista. */
  .seg {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 1px;
    padding: 1.5px;
    border-radius: 7px;
    background: var(--surface, #f5f5f7);
  }
  button {
    appearance: none;
    border: none;
    background: transparent;
    border-radius: 5.5px;
    padding: 2.5px 7px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.25;
    color: var(--ink-soft, #6e6e73);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.14s ease, color 0.14s ease;
  }
  button:hover:not(.active) {
    color: var(--ink, #1d1d1f);
  }
  button.active {
    background: var(--paper, #fff);
    color: var(--ink, #1d1d1f);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  }
  button:focus-visible {
    outline: 2px solid var(--accent, #7c5cff);
    outline-offset: 1px;
  }
  :global(:root[data-theme='dark']) .seg {
    background: rgba(255, 255, 255, 0.06);
  }
  :global(:root[data-theme='dark']) button.active {
    background: rgba(255, 255, 255, 0.12);
    box-shadow: none;
  }
</style>
