<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { deserialize } from '$app/forms';
  import HomeHead from '$lib/components/HomeHead.svelte';
  import HomeWorkbench from '$lib/components/HomeWorkbench.svelte';
  import WorkbenchPageShimmer from '$lib/components/WorkbenchPageShimmer.svelte';
  import CanvasFlow from '$lib/components/canvas/CanvasFlow.svelte';
  import GenNode from '$lib/components/canvas/GenNode.svelte';
  import { newGenNodeAt } from '$lib/canvas/new-node';
  import { toFlowEdges, type CanvasEdgeRow } from '$lib/canvas-edges';
  import type { GenMedium, GenNode as GenNodeState, ModelChoice } from '$lib/canvas/gen-node';

  let { data } = $props();

  /**
   * IL RECAP È UN NODO, non più una pagina.
   *
   * Sta a (0,0) perché `fitView` inquadra quel che c'è: da solo riempie lo schermo all'apertura, e
   * quando si aggiungono nodi la vista si allarga da sé senza che questa misura cambi.
   *
   * Le dimensioni sono quelle della colonna che il recap aveva prima — `HomeWorkbench` è scritto
   * per una larghezza da pagina, e stringerlo dentro una tile lo spezzerebbe.
   *
   * `connectable: false` perché il recap non produce niente: riassume. Un arco che parte da qui
   * non avrebbe un significato che `canConnect` sappia dare, e i due puntini sarebbero l'invito a
   * un gesto che poi fallisce.
   */
  const RECAP = { id: 'recap', x: 0, y: 0, w: 1120, h: 1400, connectable: false };

  type ItemRow = {
    id: string;
    ref_kind: string;
    ref_id: string | null;
    medium: string | null;
    model: string | null;
    prompt: string | null;
    params: Record<string, unknown> | null;
    x: number;
    y: number;
    w: number;
    h: number;
  };

  /**
   * I nodi vivono QUI e non nel server load: fra il gesto e la risposta ce n'è uno che esiste solo
   * sullo schermo, e ricaricare i dati a ogni salvataggio farebbe sparire e ricomparire quello che
   * si sta scrivendo. Il server è la verità all'apertura; da lì in poi comanda questa lista, e i
   * salvataggi la confermano.
   */
  let gens = $state<GenNodeState[]>(
    ((data.items ?? []) as ItemRow[])
      .filter((i) => i.ref_kind === 'gen' && i.medium)
      .map((i) => ({
        id: i.id,
        medium: i.medium as GenMedium,
        model: i.model,
        prompt: i.prompt ?? '',
        params: (i.params ?? {}) as GenNodeState['params'],
        refId: i.ref_id
      }))
  );

  let places = $state<Record<string, { x: number; y: number; w: number; h: number }>>(
    Object.fromEntries(
      ((data.items ?? []) as ItemRow[])
        .filter((i) => i.ref_kind === 'gen')
        .map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }])
    )
  );

  const tiles = $derived([
    RECAP,
    ...gens.map((g) => ({ id: g.id, ...places[g.id], connectable: true }))
  ]);

  const edges = $derived(toFlowEdges((data.edges ?? []) as CanvasEdgeRow[]));

  // Il catalogo dei modelli arriva più tardi: il nodo nasce senza modello e l'overlay lo chiede.
  // Finché non c'è, `Genera` resta spento — meglio di un modello scelto a caso e pagato.
  let catalogue = $state<Record<GenMedium, ModelChoice[]>>({ text: [], image: [], video: [] });

  /**
   * `x-sveltekit-action` è ciò che distingue questa chiamata dall'invio di un form: senza,
   * SvelteKit risponde 303 verso la pagina, `fetch` segue il redirect da solo e torna l'HTML con
   * `res.ok` vero — si legge «salvato» mentre la tabella resta vuota. Lezione già pagata dalla
   * tela di `canvas-lab`, e vale identica qui.
   *
   * L'esito sta nel CORPO: una action risponde 200 anche quando rifiuta.
   */
  async function post(
    action: string,
    fields: Record<string, string | number>
  ): Promise<Record<string, unknown> | null> {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));

    try {
      const res = await fetch(`?/${action}`, {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
        body: fd
      });
      const result = deserialize(await res.text());
      if (result.type !== 'success') {
        failed = 'non salvato';
        return null;
      }
      failed = null;
      return (result.data ?? null) as Record<string, unknown> | null;
    } catch {
      failed = 'non salvato';
      return null;
    }
  }

  let failed = $state<string | null>(null);

  async function create(medium: GenMedium, at: { x: number; y: number }) {
    if (!data.canvasId) return;

    const tile = newGenNodeAt(medium, at);
    gens = [...gens, { id: tile.id, medium, model: null, prompt: '', params: {}, refId: null }];
    places = { ...places, [tile.id]: { x: tile.x, y: tile.y, w: tile.w, h: tile.h } };

    // L'id vero lo conia il database: quello locale serve solo a disegnare subito il nodo, e
    // viene sostituito appena la riga esiste — senza, il primo salvataggio del prompt creerebbe
    // una SECONDA riga invece di aggiornare la prima.
    const res = await post('gen', {
      canvas_id: data.canvasId,
      medium,
      prompt: '',
      model: '',
      params: '{}',
      x: tile.x,
      y: tile.y,
      w: tile.w,
      h: tile.h
    });

    const realId = res?.id;
    if (typeof realId !== 'string') return;

    gens = gens.map((g) => (g.id === tile.id ? { ...g, id: realId } : g));
    places = { ...places, [realId]: places[tile.id] };
  }

  function patch(id: string, change: Partial<GenNodeState>) {
    gens = gens.map((g) => (g.id === id ? { ...g, ...change } : g));

    const node = gens.find((g) => g.id === id);
    const place = places[id];
    if (!node || !place || !data.canvasId) return;

    void post('gen', {
      canvas_id: data.canvasId,
      item_id: id,
      medium: node.medium,
      prompt: node.prompt,
      model: node.model ?? '',
      params: JSON.stringify(node.params),
      ...place
    });
  }

  function move(id: string, x: number, y: number) {
    const place = places[id];
    if (!place) return;

    places = { ...places, [id]: { ...place, x, y } };
    void post('move', { item_id: id, x, y });
  }

  function connect(source: string, target: string) {
    if (!data.canvasId) return;
    void post('connect', {
      canvas_id: data.canvasId,
      source_item_id: source,
      target_item_id: target,
      kind: 'derives_from'
    });
  }
</script>

<svelte:head><title>Anomalia — {$_('app.home.workbench.title')}</title></svelte:head>

<!-- Lo scheletro resta fuori dalla tela: dentro sarebbe un nodo che compare e sparisce, e
     `fitView` inquadrerebbe due volte — una sullo scheletro, una sul recap.

     `extras` non si passa di proposito: erano i badge differiti del layout, e qui dentro
     non ci sono. Servivano solo come sovrascrittura anticipata — `overview` porta già
     ognuno di quei numeri, quindi il recap è identico, appena meno impaziente.

     Se un giorno questo shimmer non finisce più, il sospettato NON è la promessa: è
     `HomeWorkbench` che esplode mentre si disegna. Il ramo `:then` muore a metà, `{#await}`
     resta su quello in attesa e l'errore finisce solo in console — visto una volta, con una
     variabile rimasta nel markup dopo che la sua dichiarazione era stata tolta. -->
{#await data.overview}
  <WorkbenchPageShimmer variant="workbench" />
{:then overview}
  <div class="wb-canvas">
    {#if failed}
      <!-- Un salvataggio perso in silenzio si scopre alla prossima apertura, quando il prompt
           scritto non c'è più e nessuno sa perché. -->
      <p class="wb-saving" role="status">{failed}</p>
    {/if}
    <CanvasFlow {tiles} {edges} onMove={move} onConnect={connect} onCreate={create}>
      {#snippet tile({ id })}
        {#if id === 'recap'}
          <div class="wb-recap">
            <HomeHead {overview} brandSlug={data.brand.slug} />
            <HomeWorkbench
              brandSlug={data.brand.slug}
              {overview}
              launchedAt={data.brand?.launched_at ?? null}
            />
          </div>
        {:else}
          {@const node = gens.find((g) => g.id === id)}
          {#if node}
            <GenNode
              {node}
              choices={catalogue[node.medium]}
              onchange={(change) => patch(id, change)}
            />
          {/if}
        {/if}
      {/snippet}
    </CanvasFlow>
  </div>
{:catch}
  <p class="wb-failed">{$_('app.home.workbench.failed')}</p>
{/await}

<style>
  .wb-canvas {
    position: relative;
    height: 100%;
    min-height: 0;
  }

  .wb-saving {
    position: absolute;
    z-index: 10;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 4px 10px;
    font-size: 12px;
    color: #c0392b;
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 999px;
  }

  /* Il nodo si comporta come la pagina che conteneva: sfondo pieno e il suo respiro attorno.
     Senza, il recap galleggia sulla griglia della tela e le sue sezioni si leggono come tile.

     `--paper-2` e non `--paper`: la tela è già `--paper`, e un nodo dello stesso colore avrebbe
     solo il bordo a dirlo — un riquadro che si perde appena si allontana lo zoom. */
  .wb-recap {
    height: 100%;
    overflow: hidden;
    padding: 24px 28px;
    border-radius: 18px;
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }

  .wb-failed {
    margin: 0;
    font-size: 13.5px;
    color: var(--ink-soft);
  }
</style>
