<script lang="ts">
  /**
   * IL WIZARD, UN PASSO ALLA VOLTA — sito → analisi → prodotti → target → concorrenti →
   * handle del brand → overview → approva. `STEPS` è la tabella: l'ordine e le etichette stanno
   * qui, non sparsi in `if`/`else` per ogni bottone avanti/indietro.
   *
   * LO STATO SOPRAVVIVE A UN REFRESH — `sessionStorage`, chiave per progetto: un wizard aperto
   * per sbaglio in un'altra scheda non lo sovrascrive, e chiudere la scheda lo dimentica (un
   * brand a metà non deve restare per sempre in un cassetto).
   */
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import PageHead from '$lib/components/PageHead.svelte';
  import PlatformGlyph from '$lib/components/PlatformGlyph.svelte';
  import { renderBrandContentHtml } from '$lib/canvas/brand-content-chips';
  import { SOCIAL_PLATFORMS } from '$lib/canvas/social-platforms';
  import '$lib/styles/doc-prose.css';

  let { data, form } = $props();

  const STEPS = ['website', 'analysis', 'products', 'target', 'competitors', 'handles', 'overview'] as const;
  type Step = (typeof STEPS)[number];

  const STEP_LABEL: Record<Step, string> = {
    website: 'Website',
    analysis: 'Analysis',
    products: 'Products',
    target: 'Target',
    competitors: 'Competitors',
    handles: 'Social handles',
    overview: 'Overview'
  };

  type Handle = { platform: string; handle: string };
  type Product = {
    externalId: string;
    handle: string | null;
    title: string;
    description: string | null;
    price: number | null;
    currency: string | null;
    url: string | null;
    images: Array<{ url: string; position?: number }>;
    available: boolean | null;
    included: boolean;
  };

  type Draft = {
    website: string;
    name: string;
    shortDescription: string;
    logoUrl: string;
    products: Product[];
    productsPlatform: string;
    target: string;
    colours: string[];
    competitorHandles: Handle[];
    brandHandles: Handle[];
    content: string;
  };

  function emptyDraft(): Draft {
    return {
      website: '',
      name: '',
      shortDescription: '',
      logoUrl: '',
      products: [],
      productsPlatform: '',
      target: '',
      colours: [],
      competitorHandles: [],
      brandHandles: [],
      content: ''
    };
  }

  const STORAGE_KEY = $derived(`feega:brand-wizard:${data.project.id}`);

  let step = $state<Step>('website');
  let draft = $state<Draft>(emptyDraft());
  let busy = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { step: Step; draft: Draft };
        if (STEPS.includes(parsed.step)) step = parsed.step;
        if (parsed.draft) draft = { ...emptyDraft(), ...parsed.draft };
      }
    } catch {
      // una sessionStorage rotta non deve impedire di aprire il wizard da zero
    }
  });

  $effect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, draft }));
    } catch {
      // niente spazio, niente persistenza — il wizard resta comunque usabile in questa sessione
    }
  });

  const stepIndex = $derived(STEPS.indexOf(step));

  function goStep(next: Step) {
    step = next;
    error = null;
  }

  function back() {
    if (stepIndex > 0) goStep(STEPS[stepIndex - 1]);
  }

  function forward() {
    if (stepIndex < STEPS.length - 1) goStep(STEPS[stepIndex + 1]);
  }

  function withBusy(onDone?: (result: unknown) => void) {
    return () => {
      busy = true;
      error = null;
      return async ({ result, update }: { result: { type: string; data?: unknown }; update: () => Promise<void> }) => {
        busy = false;
        if (result.type === 'failure') {
          const data = result.data as { error?: string } | undefined;
          error = data?.error === 'credits_exhausted' ? 'Out of AI credits for this billing period.' : (data?.error ?? 'Something went wrong.');
          return;
        }
        await update();
        onDone?.(result.data);
      };
    };
  }

  function applyAnalysis(result: unknown) {
    const r = result as {
      name?: string;
      shortDescription?: string;
      logoUrl?: string | null;
      suggestedContent?: string;
      products?: Product[];
      website?: string;
    };

    draft.name = r.name ?? draft.name;
    draft.shortDescription = r.shortDescription ?? draft.shortDescription;
    draft.logoUrl = r.logoUrl ?? draft.logoUrl;
    draft.content = r.suggestedContent ?? draft.content;
    draft.products = r.products ?? [];
    draft.website = r.website ?? draft.website;

    const targetMatch = /## Target\n\n([\s\S]*?)(\n\n##|$)/.exec(draft.content);
    if (targetMatch) draft.target = targetMatch[1].trim();

    const coloursMatch = /## Colours\n\n([\s\S]*?)(\n\n##|$)/.exec(draft.content);
    if (coloursMatch) {
      draft.colours = coloursMatch[1]
        .split('\n')
        .map((l) => l.replace(/^- /, '').trim())
        .filter(Boolean);
    }

    const handlesMatch = /## Social handles\n\n([\s\S]*?)(\n\n##|$)/.exec(draft.content);
    if (handlesMatch) {
      draft.brandHandles = handlesMatch[1]
        .split('\n')
        .map((l) => /^- (\w+):@(.+)$/.exec(l.trim()))
        .filter((m): m is RegExpExecArray => Boolean(m))
        .map((m) => ({ platform: m[1], handle: m[2] }));
    }

    goStep('analysis');
  }

  function applySync(result: unknown) {
    const r = result as { platform?: string | null; products?: Product[] };
    if (r.platform) draft.productsPlatform = r.platform;
    if (r.products) draft.products = r.products;
  }

  function addHandle(list: Handle[]): Handle[] {
    return [...list, { platform: 'instagram', handle: '' }];
  }

  function removeHandle(list: Handle[], i: number): Handle[] {
    return list.filter((_, idx) => idx !== i);
  }

  function recompose() {
    const parts: string[] = [];
    if (draft.target.trim()) parts.push(`## Target\n\n${draft.target.trim()}`);
    if (draft.colours.length) parts.push(`## Colours\n\n${draft.colours.map((c) => `- ${c}`).join('\n')}`);
    const brandLines = draft.brandHandles.filter((h) => h.handle.trim()).map((h) => `- ${h.platform}:@${h.handle.trim().replace(/^@/, '')}`);
    if (brandLines.length) parts.push(`## Social handles\n\n${brandLines.join('\n')}`);
    const competitorLines = draft.competitorHandles.filter((h) => h.handle.trim()).map((h) => `- ${h.platform}:@${h.handle.trim().replace(/^@/, '')}`);
    if (competitorLines.length) parts.push(`## Competitors\n\n${competitorLines.join('\n')}`);
    draft.content = parts.join('\n\n');
  }

  $effect(() => {
    if (step === 'overview') recompose();
  });

  function afterCreate() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // niente da pulire se sessionStorage non è disponibile
    }
  }

  const renderedContent = $derived(renderBrandContentHtml(draft.content));
</script>

<PageHead title="New brand" subtitle={`Step ${stepIndex + 1} of ${STEPS.length} — ${STEP_LABEL[step]}`} />

<div class="wizard">
  <ol class="steps">
    {#each STEPS as s, i (s)}
      <li class:active={s === step} class:done={i < stepIndex}>{STEP_LABEL[s]}</li>
    {/each}
  </ol>

  {#if error}
    <p class="msg warn">{error}</p>
  {/if}

  {#if step === 'website'}
    <section class="panel">
      <h2>Where can we find this brand?</h2>
      <p class="hint">We'll read the site for a logo, colours, description and detected products. You can skip this and fill everything by hand.</p>

      <form
        method="POST"
        action="?/analyze"
        use:enhance={withBusy((result) => applyAnalysis(result))}
      >
        <input name="url" type="url" placeholder="https://example.com" bind:value={draft.website} />
        <div class="row">
          <button class="btn ghost" type="button" onclick={forward}>Skip, no website</button>
          <button class="btn primary" type="submit" disabled={busy || !draft.website}>{busy ? 'Reading…' : 'Analyze'}</button>
        </div>
      </form>
    </section>
  {/if}

  {#if step === 'analysis'}
    <section class="panel">
      <h2>What we found</h2>
      <div class="found">
        {#if draft.logoUrl}<img class="logo" src={draft.logoUrl} alt="" />{/if}
        <label class="field">
          <span>Name</span>
          <input type="text" bind:value={draft.name} />
        </label>
        <label class="field">
          <span>Short description</span>
          <input type="text" bind:value={draft.shortDescription} />
        </label>
        {#if draft.colours.length}
          <div class="swatches">
            {#each draft.colours as c (c)}
              <span class="swatch" style={`background:${c}`} title={c}></span>
            {/each}
          </div>
        {/if}
        <p class="hint">{draft.products.length} product{draft.products.length === 1 ? '' : 's'} detected.</p>
      </div>
      <div class="row">
        <button class="btn ghost" type="button" onclick={back}>Back</button>
        <button class="btn primary" type="button" onclick={forward}>Continue</button>
      </div>
    </section>
  {/if}

  {#if step === 'products'}
    <section class="panel">
      <h2>Products</h2>
      {#if !draft.products.length}
        <p class="hint">No products detected. This step is optional.</p>
      {:else}
        <ul class="products">
          {#each draft.products as p (p.externalId)}
            <li>
              <label>
                <input type="checkbox" bind:checked={p.included} />
                <span class="title">{p.title}</span>
              </label>
              {#if p.description}<p class="desc">{p.description}</p>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      <div class="row">
        <button class="btn ghost" type="button" onclick={back}>Back</button>
        <button class="btn primary" type="button" onclick={forward}>Continue</button>
      </div>
    </section>
  {/if}

  {#if step === 'target'}
    <section class="panel">
      <h2>Who is this brand for?</h2>
      <p class="hint">A free-text description of the audience. We drafted one from the site — edit it freely.</p>
      <textarea rows="5" bind:value={draft.target} placeholder="e.g. Small coffee shops in Northern Italy, owner-operators, 25-45"></textarea>
      <div class="row">
        <button class="btn ghost" type="button" onclick={back}>Back</button>
        <button class="btn primary" type="button" onclick={forward}>Continue</button>
      </div>
    </section>
  {/if}

  {#if step === 'competitors'}
    <section class="panel">
      <h2>Competitors' social handles</h2>
      <p class="hint">Recorded only — connecting accounts to publish happens later, from Settings.</p>
      {#each draft.competitorHandles as h, i (i)}
        <div class="handle-row">
          <select bind:value={h.platform}>
            {#each SOCIAL_PLATFORMS as p (p)}
              <option value={p}>{p}</option>
            {/each}
          </select>
          <PlatformGlyph platform={h.platform} />
          <input type="text" placeholder="handle" bind:value={h.handle} />
          <button class="btn ghost small" type="button" onclick={() => (draft.competitorHandles = removeHandle(draft.competitorHandles, i))}>Remove</button>
        </div>
      {/each}
      <button class="btn ghost" type="button" onclick={() => (draft.competitorHandles = addHandle(draft.competitorHandles))}>+ Add competitor handle</button>
      <div class="row">
        <button class="btn ghost" type="button" onclick={back}>Back</button>
        <button class="btn primary" type="button" onclick={forward}>Continue</button>
      </div>
    </section>
  {/if}

  {#if step === 'handles'}
    <section class="panel">
      <h2>This brand's social handles</h2>
      <p class="hint">Recorded only — connecting accounts to publish happens later, from Settings → Connected accounts.</p>
      {#each draft.brandHandles as h, i (i)}
        <div class="handle-row">
          <select bind:value={h.platform}>
            {#each SOCIAL_PLATFORMS as p (p)}
              <option value={p}>{p}</option>
            {/each}
          </select>
          <PlatformGlyph platform={h.platform} />
          <input type="text" placeholder="handle" bind:value={h.handle} />
          <button class="btn ghost small" type="button" onclick={() => (draft.brandHandles = removeHandle(draft.brandHandles, i))}>Remove</button>
        </div>
      {/each}
      <button class="btn ghost" type="button" onclick={() => (draft.brandHandles = addHandle(draft.brandHandles))}>+ Add handle</button>
      <div class="row">
        <button class="btn ghost" type="button" onclick={back}>Back</button>
        <button class="btn primary" type="button" onclick={forward}>Continue</button>
      </div>
    </section>
  {/if}

  {#if step === 'overview'}
    <section class="panel">
      <h2>Review before creating</h2>

      <label class="field">
        <span>Name</span>
        <input type="text" bind:value={draft.name} required />
      </label>

      <label class="field">
        <span>Content</span>
        <textarea rows="10" bind:value={draft.content} oninput={() => {}}></textarea>
      </label>

      <div class="doc-prose preview">
        {@html renderedContent}
      </div>

      <form
        method="POST"
        action="?/create"
        use:enhance={() => {
          busy = true;
          error = null;
          return async ({ result }) => {
            busy = false;
            if (result.type === 'failure') {
              const data = result.data as { error?: string } | undefined;
              error = data?.error ?? 'Could not create the brand';
              return;
            }
            afterCreate();
            if (result.type === 'redirect') {
              await goto(result.location);
            }
          };
        }}
      >
        <input type="hidden" name="name" value={draft.name} />
        <input type="hidden" name="website" value={draft.website} />
        <input type="hidden" name="shortDescription" value={draft.shortDescription} />
        <input type="hidden" name="content" value={draft.content} />
        <input type="hidden" name="logoUrl" value={draft.logoUrl} />
        <input type="hidden" name="productsPlatform" value={draft.productsPlatform} />
        <input type="hidden" name="products" value={JSON.stringify(draft.products)} />

        <div class="row">
          <button class="btn ghost" type="button" onclick={back}>Back</button>
          <button class="btn primary" type="submit" disabled={busy || !draft.name.trim()}>{busy ? 'Creating…' : 'Approve'}</button>
        </div>
      </form>
    </section>
  {/if}
</div>

<style>
  .wizard { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }

  .steps { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
  .steps li { font-size: 11px; padding: 4px 8px; border: 1px solid var(--line); color: var(--ink-faint); }
  .steps li.active { color: var(--ink); border-color: var(--ink); }
  .steps li.done { color: var(--ink-soft); }

  .panel { display: flex; flex-direction: column; gap: 14px; }
  .panel h2 { margin: 0; font-size: 16px; }
  .hint { margin: 0; font-size: 12px; color: var(--ink-soft); }

  .field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .field span { color: var(--ink-soft); }
  input[type='text'], input[type='url'], textarea, select {
    border: 1px solid var(--line); background: var(--paper); padding: 8px; font: inherit; color: var(--ink);
  }
  textarea { resize: vertical; }

  .row { display: flex; justify-content: space-between; gap: 8px; }
  .btn { border: 1px solid var(--line); background: var(--paper); padding: 8px 14px; font-size: 13px; cursor: pointer; }
  .btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .btn.ghost { background: transparent; }
  .btn.small { padding: 4px 8px; font-size: 11px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .msg.warn { font-size: 12px; color: var(--warn, #b00); border: 1px solid var(--warn, #b00); padding: 8px; margin: 0; }

  .found { display: flex; flex-direction: column; gap: 10px; }
  .logo { width: 56px; height: 56px; object-fit: cover; border: 1px solid var(--line); }
  .swatches { display: flex; gap: 6px; }
  .swatch { width: 24px; height: 24px; border: 1px solid var(--line); }

  .products { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .products li { border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  .products label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .products .desc { margin: 4px 0 0 24px; font-size: 12px; color: var(--ink-soft); }

  .handle-row { display: flex; align-items: center; gap: 8px; }
  .handle-row select { flex: 0 0 auto; }
  .handle-row input { flex: 1; }

  .preview { border: 1px solid var(--line); padding: 12px; }
</style>
