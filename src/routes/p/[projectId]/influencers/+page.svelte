<script lang="ts">
  import { enhance } from '$app/forms';
  import PageHead from '$lib/components/PageHead.svelte';
  import InfluencerBuilder from '$lib/components/canvas/builder/InfluencerBuilder.svelte';
  import { describeBuilderSelections, type BuilderSelections } from '$lib/canvas/influencer-builder-options';
  import { influencerDrag, CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag } from '$lib/canvas/drag-payload';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';

  let { data, form } = $props();

  let mode = $state<'list' | 'ai' | 'upload'>('list');
  let builderSelections = $state<BuilderSelections>({});
  let name = $state('');
  let templateOf = $state<string | null>(null);
  let submitting = $state(false);

  const facePrompt = $derived(describeBuilderSelections(builderSelections));

  function onDragStart(e: DragEvent, influencer: { id: string }) {
    if (!e.dataTransfer) return;
    const drag = influencerDrag(influencer);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag(drag));
    e.dataTransfer.setData(CANVAS_DRAG_MEDIUM, drag.type);
  }

  function useAsTemplate(influencer: (typeof data.influencers)[number]) {
    templateOf = influencer.id;
    name = `${influencer.name} (copy)`;
    builderSelections = (influencer.builder as BuilderSelections) ?? {
      gender: influencer.gender ?? undefined,
      ethnicity: influencer.ethnicity ?? undefined
    };
    mode = 'ai';
  }

  function startFresh() {
    templateOf = null;
    name = '';
    builderSelections = {};
    mode = 'ai';
  }
</script>

<div class="influencers-page">
  <PageHead title="Influencers" subtitle="Reusable faces for consistent images and videos across every project." />

  {#if mode === 'list'}
    <div class="toolbar">
      <button type="button" class="primary" onclick={startFresh}>Create with AI</button>
      <button type="button" onclick={() => (mode = 'upload')}>Upload photos</button>
    </div>

    {#if !data.influencers.length}
      <div class="empty">
        <h3>No influencers yet</h3>
        <p>Create one from a description, or upload photos of a real person.</p>
      </div>
    {:else}
      <div class="grid">
        {#each data.influencers as influencer (influencer.id)}
          <div class="card">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="cover" draggable="true" ondragstart={(e) => onDragStart(e, influencer)}>
              {#if influencer.coverUrl}
                <img src={influencer.coverUrl} alt={influencer.name} loading="lazy" />
              {:else}
                <span class="cover-ph">{influencer.name.slice(0, 2).toUpperCase()}</span>
              {/if}
            </div>
            <div class="card-body">
              <p class="name">{influencer.name}</p>
              <p class="meta">{[influencer.gender, influencer.ethnicity, influencer.bodyType].filter(Boolean).join(' · ')}</p>
              <button type="button" class="template-btn" onclick={() => useAsTemplate(influencer)}>Use as template</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else if mode === 'ai'}
    <form
      method="POST"
      action="?/generate"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          submitting = false;
          await update();
          if (form && 'ok' in form && form.ok) mode = 'list';
        };
      }}
    >
      <button type="button" class="back" onclick={() => (mode = 'list')}>Back</button>

      <label class="field">
        <span>Name</span>
        <input name="name" bind:value={name} required />
      </label>

      {#if templateOf}
        <input type="hidden" name="templateOf" value={templateOf} />
      {/if}
      <input type="hidden" name="prompt" value={facePrompt} />
      <input type="hidden" name="builder" value={JSON.stringify(builderSelections)} />
      <input type="hidden" name="gender" value={Array.isArray(builderSelections.gender) ? '' : (builderSelections.gender ?? '')} />
      <input
        type="hidden"
        name="ethnicity"
        value={Array.isArray(builderSelections.ethnicity) ? '' : (builderSelections.ethnicity ?? '')}
      />

      <InfluencerBuilder selections={builderSelections} onChange={(s) => (builderSelections = s)} />

      {#if form && 'error' in form && form.error}
        <p class="error">{form.error}</p>
      {/if}

      <button type="submit" class="primary" disabled={submitting || !name.trim() || !facePrompt.trim()}>
        {submitting ? 'Generating…' : 'Generate'}
      </button>
    </form>
  {:else if mode === 'upload'}
    <form
      method="POST"
      action="?/upload"
      enctype="multipart/form-data"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          submitting = false;
          await update();
          if (form && 'ok' in form && form.ok) mode = 'list';
        };
      }}
    >
      <button type="button" class="back" onclick={() => (mode = 'list')}>Back</button>

      <label class="field">
        <span>Name</span>
        <input name="name" required />
      </label>

      <label class="field">
        <span>Photos</span>
        <input type="file" name="photo" accept="image/*" multiple required />
      </label>

      <label class="consent">
        <input type="checkbox" name="consent" />
        I have this person's permission to use their photos.
      </label>

      {#if form && 'error' in form && form.error}
        <p class="error">{form.error}</p>
      {/if}

      <button type="submit" class="primary" disabled={submitting}>{submitting ? 'Uploading…' : 'Create'}</button>
    </form>
  {/if}
</div>

<style>
  .influencers-page {
    max-width: var(--content-max, 1100px);
    margin: 0 auto;
    padding: 0;
  }

  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .toolbar button,
  form .back {
    padding: 6px 12px;
    font-size: 12.5px;
    font-weight: 600;
    border: 1px solid var(--line-2, #d2d2d7);
    background: var(--paper, #fff);
    border-radius: 0;
    cursor: pointer;
  }
  .primary {
    background: var(--accent, #7c5cff);
    color: #fff;
    border-color: var(--accent, #7c5cff);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty {
    text-align: center;
    padding: 48px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .empty h3 {
    margin: 0;
    font-size: 18px;
  }
  .empty p {
    margin: 0;
    color: var(--ink-soft);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .card {
    background: var(--paper-2);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .cover {
    aspect-ratio: 3 / 4;
    background: var(--paper);
    display: grid;
    place-items: center;
    cursor: grab;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cover-ph {
    font-size: 20px;
    font-weight: 700;
    color: var(--ink-faint);
  }
  .card-body {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .name {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .meta {
    margin: 0;
    font-size: 11px;
    color: var(--ink-soft);
  }
  .template-btn {
    margin-top: 4px;
    padding: 4px 0;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--accent-ink, var(--accent, #7c5cff));
    background: none;
    border: 0;
    text-align: left;
    cursor: pointer;
  }
  .template-btn:hover {
    text-decoration: underline;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 420px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
  }
  .field input {
    font: inherit;
    font-weight: 400;
    padding: 6px 8px;
    border: 1px solid var(--line-2);
    border-radius: 0;
    background: var(--paper-2);
  }

  .consent {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ink);
  }

  .error {
    margin: 0;
    font-size: 12px;
    color: var(--danger, #d92c20);
  }
</style>
