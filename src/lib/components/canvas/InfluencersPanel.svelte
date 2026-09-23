<script lang="ts">
  /**
   * INFLUENCER DEL CATALOGO + DELL'ORG, DRAGGABILI SULLA TELA CHE È GIÀ APERTA.
   *
   * Stessa famiglia di `ProjectDragPanel` (Assets/Brands): un pannello non modale, la tela resta
   * interattiva dietro. Componente autonomo — non estende `ProjectDragPanel`/`CanvasLeftPanel`
   * (lavoro in corso di un altro agente sulla shell in questa stessa sessione) — porta la propria
   * intestazione e chiusura, cablabile da qualunque contenitore la rail finirà per usare.
   *
   * `influencerDrag` (`drag-payload.ts`) costruisce lo stesso pacchetto di ogni altra card
   * trascinabile: un nodo `influencer` nasce pieno, con `data.influencer_id` e niente altro — le
   * viste il server le legge da `influencer_views` quando la tila si disegna.
   */
  import { _ } from 'svelte-i18n';
  import X from '@lucide/svelte/icons/x';
  import UserRound from '@lucide/svelte/icons/user-round';
  import { influencerDrag, CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag } from '$lib/canvas/drag-payload';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';

  type PanelInfluencer = {
    id: string;
    name: string;
    source: 'catalogue' | 'generated' | 'upload';
    gender: string | null;
    age: number | null;
    ethnicity: string | null;
    bodyType: string | null;
    coverUrl: string | null;
  };

  let { projectId, onclose }: { projectId: string; onclose?: () => void } = $props();

  let influencers = $state<PanelInfluencer[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let reload = $state(0);
  let genderFilter = $state('');
  let ageFilter = $state('');
  let ethnicityFilter = $state('');

  function retry() {
    reload += 1;
  }

  $effect(() => {
    const id = projectId;
    void reload;

    if (!id) {
      loading = false;
      failed = false;
      influencers = [];
      return;
    }

    let live = true;
    loading = true;
    failed = false;

    fetch(`/api/v1/projects/${id}/agent/influencers`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((res: { influencers?: PanelInfluencer[] }) => {
        if (!live) return;
        influencers = res.influencers ?? [];
      })
      .catch(() => {
        if (live) failed = true;
      })
      .finally(() => {
        if (live) loading = false;
      });

    return () => {
      live = false;
    };
  });

  const genderOptions = $derived([...new Set(influencers.map((i) => i.gender).filter((g): g is string => Boolean(g)))].sort());
  const ethnicityOptions = $derived(
    [...new Set(influencers.map((i) => i.ethnicity).filter((e): e is string => Boolean(e)))].sort()
  );

  function ageBand(age: number | null): string {
    if (age === null) return '';
    if (age < 25) return 'under-25';
    if (age < 40) return '25-39';
    if (age < 55) return '40-54';
    return '55-plus';
  }

  const filtered = $derived(
    influencers.filter((i) => {
      if (genderFilter && i.gender !== genderFilter) return false;
      if (ethnicityFilter && i.ethnicity !== ethnicityFilter) return false;
      if (ageFilter && ageBand(i.age) !== ageFilter) return false;
      return true;
    })
  );

  const catalogue = $derived(filtered.filter((i) => i.source === 'catalogue'));
  const own = $derived(filtered.filter((i) => i.source !== 'catalogue'));

  function onDragStart(e: DragEvent, influencer: PanelInfluencer) {
    if (!e.dataTransfer) return;
    const drag = influencerDrag(influencer);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(CANVAS_DRAG_FILLED_NODE, serializeFilledNodeDrag(drag));
    e.dataTransfer.setData(CANVAS_DRAG_MEDIUM, drag.type);
  }
</script>

<div class="panel">
  <div class="panel-head">
    <h3>{$_('app.nav2.influencers')}</h3>
    {#if onclose}
      <button type="button" class="close" onclick={onclose} aria-label={$_('app.shell.closePanel')}>
        <X size={14} />
      </button>
    {/if}
  </div>

  {#if genderOptions.length || ethnicityOptions.length}
    <div class="filters">
      {#if genderOptions.length}
        <select class="filter" bind:value={genderFilter} aria-label="Gender">
          <option value="">All genders</option>
          {#each genderOptions as g (g)}
            <option value={g}>{g}</option>
          {/each}
        </select>
      {/if}
      <select class="filter" bind:value={ageFilter} aria-label="Age">
        <option value="">All ages</option>
        <option value="under-25">Under 25</option>
        <option value="25-39">25-39</option>
        <option value="40-54">40-54</option>
        <option value="55-plus">55+</option>
      </select>
      {#if ethnicityOptions.length}
        <select class="filter" bind:value={ethnicityFilter} aria-label="Ethnicity">
          <option value="">All ethnicities</option>
          {#each ethnicityOptions as e (e)}
            <option value={e}>{e}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  <div class="body">
    {#if loading}
      <div class="grid" aria-hidden="true">
        {#each Array(6) as _skel}
          <span class="skel"></span>
        {/each}
      </div>
    {:else if failed}
      <div class="state">
        <p class="hint">Can't read the influencer library.</p>
        <button type="button" class="retry" onclick={retry}>Retry</button>
      </div>
    {:else if !filtered.length}
      <p class="hint">No influencers match these filters.</p>
    {:else}
      {#if catalogue.length}
        <h4 class="section">Catalogue</h4>
        <div class="grid">
          {#each catalogue as influencer (influencer.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="tile" draggable="true" ondragstart={(e) => onDragStart(e, influencer)} title={influencer.name}>
              {#if influencer.coverUrl}
                <img src={influencer.coverUrl} alt={influencer.name} loading="lazy" decoding="async" />
              {:else}
                <span class="ph"><UserRound size={20} strokeWidth={1.5} /></span>
              {/if}
              <span class="tile-name">{influencer.name}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if own.length}
        <h4 class="section">Your influencers</h4>
        <div class="grid">
          {#each own as influencer (influencer.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="tile" draggable="true" ondragstart={(e) => onDragStart(e, influencer)} title={influencer.name}>
              {#if influencer.coverUrl}
                <img src={influencer.coverUrl} alt={influencer.name} loading="lazy" decoding="async" />
              {:else}
                <span class="ph"><UserRound size={20} strokeWidth={1.5} /></span>
              {/if}
              <span class="tile-name">{influencer.name}</span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <a class="create-link" href={`/p/${projectId}/influencers`}>Create influencer</a>
</div>

<style>
  .panel {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--paper, #fff);
  }

  .panel-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 10px 8px 12px;
    border-bottom: 1px solid var(--line, #ededef);
  }
  .panel-head h3 {
    margin: 0;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--ink, #1d1d1f);
  }

  .close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--ink-soft, #6e6e73);
    cursor: pointer;
  }
  .close:hover {
    background: var(--paper-2, #f9f9f9);
    color: var(--ink, #1d1d1f);
  }

  .filters {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line, #ededef);
  }
  .filter {
    flex: 1 1 auto;
    min-width: 0;
    padding: 4px 6px;
    font-size: 11px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 0;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    padding: 0 10px;
  }

  .section {
    margin: 10px 2px 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-faint, #9a9a9e);
  }
  .section:first-child {
    margin-top: 2px;
  }

  .hint {
    margin: auto 0;
    padding: 16px 4px;
    text-align: center;
    font-size: 12.5px;
    color: var(--ink-soft, #6e6e73);
  }
  .state {
    margin: auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 4px;
  }
  .state .hint {
    margin: 0;
    padding: 0;
  }
  .retry {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 2px 0;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-ink, var(--accent, #7c5cff));
    cursor: pointer;
  }
  .retry:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    padding: 2px 1px 10px;
  }
  .tile {
    position: relative;
    aspect-ratio: 3 / 4;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--line, #ededef);
    border-radius: 0;
    background: var(--paper-2, #f9f9f9);
    cursor: grab;
  }
  .tile img {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: cover;
    display: block;
  }
  .ph {
    flex: 1;
    display: grid;
    place-items: center;
    color: var(--ink-faint, #9a9a9e);
  }
  .tile-name {
    flex: 0 0 auto;
    padding: 3px 5px;
    font-size: 10px;
    color: var(--ink-soft, #6e6e73);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .skel {
    aspect-ratio: 3 / 4;
    border: 1px solid var(--line, #ededef);
    border-radius: 0;
    background: var(--paper-2, #f9f9f9);
    animation: skel-pulse 1.2s ease-in-out infinite;
  }
  @keyframes skel-pulse {
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .skel {
      animation: none;
    }
  }

  .create-link {
    flex: 0 0 auto;
    display: block;
    padding: 8px 10px;
    text-align: center;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--accent-ink, var(--accent, #7c5cff));
    border-top: 1px solid var(--line, #ededef);
  }
  .create-link:hover {
    background: var(--paper-2, #f9f9f9);
  }
</style>
