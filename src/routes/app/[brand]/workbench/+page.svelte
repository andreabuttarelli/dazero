<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { deserialize } from '$app/forms';
  import HomeHead from '$lib/components/HomeHead.svelte';
  import HomeWorkbench from '$lib/components/HomeWorkbench.svelte';
  import WorkbenchPageShimmer from '$lib/components/WorkbenchPageShimmer.svelte';
  import CanvasFlow from '$lib/components/canvas/CanvasFlow.svelte';
  import GenNode from '$lib/components/canvas/GenNode.svelte';
  import IframeNode from '$lib/components/canvas/IframeNode.svelte';
  import { newGenNodeAt } from '$lib/canvas/new-node';
  import { newIframeNodeAt, sourceOf, type IframeNode as IframeNodeState } from '$lib/canvas/iframe-node';
  import { isGenAddable, type Addable } from '$lib/canvas/addable';
  import { toFlowEdges, type CanvasEdgeRow, type CanvasEdgeKind, type FlowEdge } from '$lib/canvas-edges';
  import { tileNode } from '$lib/canvas/connect-rules';
  import { planDelete } from '$lib/canvas/delete-plan';
  import type { GenMedium, GenNode as GenNodeState, GenRun, ModelChoice } from '$lib/canvas/gen-node';
  import { withRun, showRun, canStartRun } from '$lib/canvas/gen-history';

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
    url: string | null;
    html: string | null;
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
        refId: i.ref_id,
        // La storia arriva dal server come il resto della tela: senza, riaprire la pagina
        // mostrerebbe l'ultimo risultato e nessuna traccia di quelli di prima.
        runs: (data.runs ?? {})[i.id] ?? []
      }))
  );

  /**
   * Le pagine incorporate, accanto ai nodi che producono e non mescolate a loro: non condividono
   * nessun campo — una ha un indirizzo o dell'HTML, l'altro modello, prompt e parametri — e una
   * lista sola costringerebbe ogni lettura a chiedersi quale dei due sta guardando.
   */
  let frames = $state<IframeNodeState[]>(
    ((data.items ?? []) as ItemRow[])
      .filter((i) => i.ref_kind === 'iframe')
      .map((i) => ({
        id: i.id,
        source: sourceOf(i),
        url: i.url ?? '',
        html: i.html ?? ''
      }))
  );

  const TILE_KINDS = ['gen', 'iframe'];

  let places = $state<Record<string, { x: number; y: number; w: number; h: number }>>(
    Object.fromEntries(
      ((data.items ?? []) as ItemRow[])
        .filter((i) => TILE_KINDS.includes(i.ref_kind))
        .map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }])
    )
  );

  /**
   * `node` è quel che serve a dire NO a un arco prima che nasca. Senza, `verdictBetween` non sa
   * che tipo sia una tile e — per la sua regola, che è giusta — lascia passare tutto: la verifica
   * esisteva, testata, e non mordeva su nessuna tile vera.
   *
   * Una pagina incorporata non ha `medium`, e `tileNode` la riconosce proprio da quello.
   */
  const tiles = $derived([
    RECAP,
    ...gens.map((n) => ({
      id: n.id,
      ...places[n.id],
      connectable: true,
      node: tileNode({ id: n.id, medium: n.medium, model: n.model })
    })),
    ...frames.map((n) => ({
      id: n.id,
      ...places[n.id],
      connectable: true,
      node: tileNode({ id: n.id })
    }))
  ]);

  /**
   * Le linee stanno in uno STATO, non in un `$derived` di `data.edges`: toglierne una vuol dire
   * toglierla da qui, e una lista derivata dal server la riporterebbe indietro al primo ricalcolo
   * — lo stesso «torna in scena» che si vedeva sulle tile, sulle linee.
   */
  let edges = $state<FlowEdge[]>(toFlowEdges((data.edges ?? []) as CanvasEdgeRow[]));

  // I modelli arrivano dal server: il testo dal centralino, immagine e video dal registro dei
  // media coi loro limiti. Un nodo nasce comunque SENZA modello scelto — sceglierne uno al posto
  // dell'utente significherebbe spendere su una decisione che non ha preso.
  const catalogue = $derived(
    (data.catalogue ?? { text: [], image: [], video: [] }) as Record<GenMedium, ModelChoice[]>
  );

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

  /**
   * Una tile nuova. Quale delle due la decide `isGenAddable`, in un posto solo: la domanda «questo
   * produce o porta?» ha una risposta sola e vive accanto all'elenco di cosa si può aggiungere.
   */
  function create(what: Addable, at: { x: number; y: number }) {
    if (isGenAddable(what)) return createGen(what, at);
    return createFrame(at);
  }

  async function createGen(medium: GenMedium, at: { x: number; y: number }) {
    if (!data.canvasId) return;

    const tile = newGenNodeAt(medium, at);
    gens = [...gens, { id: tile.id, medium, model: null, prompt: '', params: {}, refId: null, runs: [] }];
    places = { ...places, [tile.id]: { x: tile.x, y: tile.y, w: tile.w, h: tile.h } };

    // L'id viaggia con la riga: è un UUID coniato qui, e il database lo scrive com'è. Prima la
    // riga nasceva con un id suo e il nodo locale doveva cambiare nome appena la risposta
    // arrivava — la tela si teneva anche la copia vecchia, che è il fantasma che restava
    // indietro. Un id solo, e non c'è più niente da scambiare.
    const saved = await post('gen', {
      canvas_id: data.canvasId,
      new_id: tile.id,
      medium,
      prompt: '',
      model: '',
      params: '{}',
      x: tile.x,
      y: tile.y,
      w: tile.w,
      h: tile.h
    });

    // Il salvataggio fallito toglie il nodo invece di lasciarlo lì: disegnato ma senza riga, il
    // primo prompt scritto dentro finirebbe su un id che non esiste.
    if (!saved) {
      gens = gens.filter((g) => g.id !== tile.id);
      const { [tile.id]: _gone, ...rest } = places;
      places = rest;
    }
  }

  /**
   * Una pagina incorporata nasce SENZA riga nel database, ed è l'unica che lo fa.
   *
   * Il vincolo `brand_canvas_items_iframe_source` vuole un indirizzo o dell'HTML, e una tile
   * appena nata non ha né l'uno né l'altro: salvarla subito sarebbe un rifiuto garantito, e
   * l'errore comparirebbe prima ancora che ci sia qualcosa da sbagliare. La riga nasce al primo
   * salvataggio con un contenuto — l'id è già quello definitivo, quindi non c'è niente da
   * scambiare dopo.
   */
  function createFrame(at: { x: number; y: number }) {
    if (!data.canvasId) return;

    const tile = newIframeNodeAt(at);
    frames = [...frames, { id: tile.id, source: tile.source, url: tile.url, html: tile.html }];
    places = { ...places, [tile.id]: { x: tile.x, y: tile.y, w: tile.w, h: tile.h } };
  }

  /** `saved` tiene gli id che una riga ce l'hanno già: il primo salvataggio crea, gli altri aggiornano. */
  let saved = $state(new Set(frames.map((f) => f.id)));

  async function patchFrame(id: string, change: Partial<IframeNodeState>) {
    frames = frames.map((f) => (f.id === id ? { ...f, ...change } : f));

    const node = frames.find((f) => f.id === id);
    const place = places[id];
    if (!node || !place || !data.canvasId) return;

    // Senza contenuto non si scrive: è la tile appena nata, e il database la rifiuterebbe.
    if (!node.url.trim() && !node.html.trim()) return;

    const exists = saved.has(id);
    const res = await post('iframe', {
      canvas_id: data.canvasId,
      ...(exists ? { item_id: id } : { new_id: id }),
      url: node.url,
      html: node.html,
      ...place
    });

    if (res && !exists) saved = new Set([...saved, id]);
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

  /**
   * PREMERE GENERA, che è il difetto che questa pagina aveva: il nodo montava senza `onrun`, e
   * `onrun?.()` con la prop assente è un no-op — il bottone si accendeva e non chiamava nessuno.
   *
   * `running` SI ALZA PRIMA DELLA CHIAMATA, ed è la guardia contro il doppio clic: un giro costa
   * crediti veri, e due pressioni vicine ne pagherebbero due di cui uno viene sovrascritto
   * dall'altro atterrando. Alzarlo dopo — o solo quando la risposta parte — lascerebbe aperta
   * esattamente la finestra in cui si clicca due volte.
   *
   * E si ABBASSA SEMPRE, anche quando la chiamata fallisce: un nodo lasciato `running` per un
   * errore di rete non si rilancia più, e l'unico modo di sbloccarlo sarebbe ricaricare.
   */
  async function run(id: string) {
    const node = gens.find((g) => g.id === id);
    if (!node || !canStartRun(node)) return;

    patchLocal(id, { running: true });

    const res = await post('run', {
      item_id: id,
      medium: node.medium,
      prompt: node.prompt,
      model: node.model ?? '',
      params: JSON.stringify(node.params)
    });

    patchLocal(id, { running: false });

    const landed = (res?.run ?? null) as GenRun | null;
    if (!landed) return;

    gens = gens.map((g) => (g.id === id ? withRun(g, landed) : g));
  }

  /**
   * Tornare a un giro di prima. Lo schermo cambia SUBITO e il salvataggio segue: guardare indietro
   * non costa niente e deve essere immediato — aspettare il server per spostare un'immagine già
   * scaricata sarebbe mezzo secondo di niente a ogni clic.
   */
  async function show(id: string, runId: string) {
    gens = gens.map((g) => (g.id === id ? showRun(g, runId) : g));

    void post('restore', { item_id: id, run_id: runId });
  }

  /** Un cambio che resta sullo schermo e basta: `running` non è una colonna, è uno stato di qui. */
  function patchLocal(id: string, change: Partial<GenNodeState>) {
    gens = gens.map((g) => (g.id === id ? { ...g, ...change } : g));
  }

  function move(id: string, x: number, y: number) {
    const place = places[id];
    if (!place) return;

    places = { ...places, [id]: { ...place, x, y } };
    void post('move', { item_id: id, x, y });
  }

  /**
   * Il verso arriva dalla tela, che l'ha già scelto guardando i due estremi. Fisso a
   * `derives_from` com'era, si sarebbe salvata una derivazione anche fra due cose che non si
   * derivano — un dato falso scritto senza che nessuno l'avesse chiesto.
   */
  function connect(source: string, target: string, kind: CanvasEdgeKind) {
    if (!data.canvasId) return;
    void post('connect', {
      canvas_id: data.canvasId,
      source_item_id: source,
      target_item_id: target,
      kind
    });
  }

  /**
   * Una linea tolta. SPARISCE SUBITO e torna se il server rifiuta.
   *
   * L'attesa qui si vedrebbe: fra il clic su «Togli» e la risposta la linea resterebbe disegnata,
   * e chi ha cliccato riclicca. Il rimedio del pentimento è già scritto — `failed` dice che non è
   * andata, e la linea ricompare dov'era invece di sparire in silenzio su un database che la
   * contiene ancora.
   */
  async function disconnect(edgeId: string) {
    const removed = edges.find((e) => e.id === edgeId);
    if (!removed) return;

    edges = edges.filter((e) => e.id !== edgeId);

    const done = await post('disconnect', { edge_id: edgeId });
    if (!done) edges = [...edges, removed];
  }

  function retype(edgeId: string, kind: CanvasEdgeKind) {
    void post('retype', { edge_id: edgeId, kind });
  }

  /**
   * LE TILE TOLTE, ED È QUI CHE LA CANCELLAZIONE DIVENTA VERA.
   *
   * Prima nessuno chiamava niente: SvelteFlow toglieva il nodo dal proprio stato, la riga restava,
   * e `syncNodes` lo riportava dentro al battito dopo perché `tiles` lo conteneva ancora. Il nodo
   * «tornava in scena», che è il difetto come lo si vedeva.
   *
   * SI TOGLIE SUBITO E SI RIMETTE SE IL SERVER RIFIUTA. La tela è un posto dove si lavora a gesti,
   * e un nodo che resta lì mezzo secondo dopo ⌫ fa premere ⌫ una seconda volta. Il ripristino
   * riporta indietro anche il POSTO: `places` senza la sua voce darebbe una tile senza misure, che
   * è una tile che non si disegna.
   *
   * GLI ARCHI CADONO CON LE TILE anche qui, dove il database lo fa già da sé con
   * `on delete cascade`: senza, resterebbero disegnati verso un nodo che non esiste più fino al
   * prossimo ricarico.
   */
  async function remove(ids: string[]) {
    const plan = planDelete({ ids, edges, undeletable: [RECAP.id] });
    if (plan.empty) return;

    const goneGens = gens.filter((g) => plan.itemIds.includes(g.id));
    const goneFrames = frames.filter((f) => plan.itemIds.includes(f.id));
    const gonePlaces = Object.fromEntries(plan.itemIds.map((id) => [id, places[id]]));
    const goneEdges = edges.filter((e) => plan.edgeIds.includes(e.id));

    gens = gens.filter((g) => !plan.itemIds.includes(g.id));
    frames = frames.filter((f) => !plan.itemIds.includes(f.id));
    places = Object.fromEntries(
      Object.entries(places).filter(([id]) => !plan.itemIds.includes(id))
    );
    edges = edges.filter((e) => !plan.edgeIds.includes(e.id));

    // Una pagina incorporata ancora senza contenuto non ha MAI avuto una riga — `saved` tiene
    // proprio quelle che ce l'hanno — e chiederne la cancellazione darebbe un rifiuto rosso su un
    // gesto perfettamente riuscito.
    const unsaved = new Set(goneFrames.filter((f) => !saved.has(f.id)).map((f) => f.id));
    const rows = plan.itemIds.filter((id) => !unsaved.has(id));
    if (!rows.length) return;

    const done = await post('remove', { item_ids: rows.join(',') });
    if (done) return;

    gens = [...gens, ...goneGens];
    frames = [...frames, ...goneFrames];
    places = { ...places, ...gonePlaces };
    edges = [...edges, ...goneEdges];
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
    <CanvasFlow
      {tiles}
      {edges}
      onMove={move}
      onConnect={connect}
      onDelete={remove}
      onEdgeDelete={disconnect}
      onEdgeRetype={retype}
      onCreate={create}
    >
      {#snippet tile({ id, selected })}
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
          {@const frame = frames.find((f) => f.id === id)}
          {#if node}
            <GenNode
              {node}
              {selected}
              choices={catalogue[node.medium]}
              onchange={(change) => patch(id, change)}
              onrun={() => run(id)}
              onshow={(runId) => show(id, runId)}
            >
              {#snippet result({ refId })}
                <!-- `/a/<id>` firma lo storage al volo e reindirizza: un URL firmato messo qui
                     scadrebbe in due ore, e una tela lasciata aperta tutto il giorno mostrerebbe
                     riquadri rotti senza che nulla dica perché. Il nodo non sa niente di tutto
                     questo — riceve un id e chiede un disegno. -->
                {#if node.medium === 'video'}
                  <!-- svelte-ignore a11y_media_has_caption -->
                  <video src={`/a/${refId}`} controls playsinline></video>
                {:else}
                  <img src={`/a/${refId}`} alt={node.prompt} loading="lazy" />
                {/if}
              {/snippet}
            </GenNode>
          {:else if frame}
            <IframeNode node={frame} onchange={(change) => patchFrame(id, change)} />
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
