<script lang="ts">
  import type { ColorPreset } from '$lib/canvas/influencer-builder-options';

  let {
    presets,
    value = null,
    onChange
  }: {
    presets: readonly ColorPreset[];
    value: string | null;
    onChange: (color: string | null) => void;
  } = $props();
</script>

<div class="row">
  {#each presets as preset (preset.color)}
    <button
      type="button"
      class="dot"
      class:active={value === preset.color}
      style={`background:${preset.color};`}
      title={preset.label}
      onclick={() => onChange(value === preset.color ? null : preset.color)}
    ></button>
  {/each}
  <input
    type="color"
    value={value || '#000000'}
    oninput={(e) => onChange(e.currentTarget.value)}
    class="custom"
    title="Custom color"
  />
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .dot {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 0;
    border: 2px solid var(--line-2, #d2d2d7);
    cursor: pointer;
  }
  .dot.active {
    border-color: var(--accent, #7c5cff);
  }
  .custom {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 0;
    border: 2px solid var(--line-2, #d2d2d7);
    background: none;
    cursor: pointer;
  }
</style>
