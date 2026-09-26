<script lang="ts">
  import type { BuilderOption } from '$lib/canvas/influencer-builder-options';

  let {
    options,
    value = null,
    onChange,
    columns = 3,
    multiSelect = false
  }: {
    options: BuilderOption[];
    value: string | string[] | null;
    onChange: (value: string | string[] | null) => void;
    columns?: number;
    multiSelect?: boolean;
  } = $props();

  function isSelected(key: string): boolean {
    if (!value) return false;
    return Array.isArray(value) ? value.includes(key) : value === key;
  }

  function toggle(key: string) {
    if (multiSelect) {
      const arr = Array.isArray(value) ? [...value] : [];
      const idx = arr.indexOf(key);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(key);
      onChange(arr.length ? arr : null);
      return;
    }
    onChange(value === key ? null : key);
  }
</script>

<div class="grid" style={`grid-template-columns: repeat(${columns}, 1fr);`}>
  {#each options as option (option.key)}
    <button
      type="button"
      class="item"
      class:active={isSelected(option.key)}
      title={option.label}
      onclick={() => toggle(option.key)}
    >
      {#if option.imageUrl}
        <img class="img" src={option.imageUrl} alt={option.label} loading="lazy" />
      {/if}
      <span class="label">{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    gap: 4px;
  }

  .item {
    aspect-ratio: 3 / 4;
    padding: 0;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--line, #ededef);
    border-radius: 0;
    background: var(--paper-2, #f9f9f9);
    cursor: pointer;
    font: inherit;
  }
  .item:hover {
    border-color: var(--line-2, #d2d2d7);
  }
  .item.active {
    border: 2px solid var(--accent, #7c5cff);
  }

  .img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0.75;
  }
  .item.active .img {
    opacity: 1;
  }

  .label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 6px 4px 3px;
    font-size: 9px;
    color: #fff;
    text-align: center;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
  }
</style>
