<script lang="ts">
  import AccordionSection from './AccordionSection.svelte';
  import ImageGridSelector from './ImageGridSelector.svelte';
  import ColorPresetPicker from './ColorPresetPicker.svelte';
  import {
    BUILDER_CATEGORIES,
    SKIN_COLOR_PRESETS,
    EYE_COLOR_PRESETS,
    HAIR_COLOR_PRESETS,
    type BuilderSelections
  } from '$lib/canvas/influencer-builder-options';

  let {
    selections = {},
    onChange
  }: {
    selections?: BuilderSelections;
    onChange: (selections: BuilderSelections) => void;
  } = $props();

  function labelFor(categoryId: string): string {
    const value = selections[categoryId];
    if (!value) return '';
    const category = BUILDER_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return '';
    const keys = Array.isArray(value) ? value : [value];
    return keys
      .map((k) => category.options.find((o) => o.key === k)?.label)
      .filter(Boolean)
      .join(', ');
  }

  function update(categoryId: string, value: string | string[] | null) {
    const next = { ...selections };
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      delete next[categoryId];
    } else {
      next[categoryId] = value;
    }
    onChange(next);
  }

  function updateColor(key: 'skinColor' | 'eyeColor' | 'hairColor', value: string | null) {
    const next = { ...selections };
    if (value) next[key] = value;
    else delete next[key];
    onChange(next);
  }

  function updateFreeText(value: string) {
    const next = { ...selections };
    if (value.trim()) next.freeText = value;
    else delete next.freeText;
    onChange(next);
  }
</script>

<div class="builder">
  {#each BUILDER_CATEGORIES as category (category.id)}
    <AccordionSection title={category.label} subtitle={labelFor(category.id)}>
      <ImageGridSelector
        options={category.options}
        value={selections[category.id] ?? null}
        multiSelect={category.multiSelect}
        onChange={(v) => update(category.id, v)}
      />
    </AccordionSection>
  {/each}

  <AccordionSection title="Skin color" subtitle={selections.skinColor ?? ''}>
    <ColorPresetPicker presets={SKIN_COLOR_PRESETS} value={selections.skinColor ?? null} onChange={(v) => updateColor('skinColor', v)} />
  </AccordionSection>

  <AccordionSection title="Eye color" subtitle={selections.eyeColor ?? ''}>
    <ColorPresetPicker presets={EYE_COLOR_PRESETS} value={selections.eyeColor ?? null} onChange={(v) => updateColor('eyeColor', v)} />
  </AccordionSection>

  <AccordionSection title="Hair color" subtitle={selections.hairColor ?? ''}>
    <ColorPresetPicker presets={HAIR_COLOR_PRESETS} value={selections.hairColor ?? null} onChange={(v) => updateColor('hairColor', v)} />
  </AccordionSection>

  <AccordionSection title="Free description" defaultOpen>
    <textarea
      class="free-text"
      placeholder="Anything else — style, vibe, clothing..."
      value={selections.freeText ?? ''}
      oninput={(e) => updateFreeText(e.currentTarget.value)}
    ></textarea>
  </AccordionSection>
</div>

<style>
  .builder {
    display: flex;
    flex-direction: column;
  }

  .free-text {
    width: 100%;
    min-height: 64px;
    padding: 6px 8px;
    font: inherit;
    font-size: 12px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 0;
    resize: vertical;
  }
</style>
