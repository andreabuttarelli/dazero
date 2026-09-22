<script lang="ts">
  /**
   * LA TELA.
   *
   * LO STATO DEI NODI VIVE QUI, IN UN POSTO SOLO (`nodes`), e non è una comodità: fra il gesto e
   * la risposta del server c'è sempre un nodo che esiste solo sullo schermo, e ricaricare i dati
   * a ogni salvataggio farebbe sparire e ricomparire quel che si sta scrivendo. Il server è la
   * verità all'apertura; da lì in poi comanda questa lista. Chi ascolterà `postgres_changes` ha
   * una lista sola da toccare, non tre sparse.
   *
   * IL DISEGNO È DI `CanvasFlow`, che è già scritto e già provato: panning, zoom, selezione col
   * riquadro, il menù del doppio clic e il rifiuto di una linea mentre il puntatore è in aria.
   * Qui si fa l'altra metà — quale riga sta dietro una tile, e cosa si scrive quando cambia.
   */
  import { createWriteQueue } from '$lib/canvas/write-queue';
  import { connectCanvas } from '$lib/realtime/canvas-channel';
  import type { PresencePeer } from '$lib/realtime/presence-peers';
  import { createSupabaseBrowserClient } from '$lib/supabase/client';
  import { deserialize } from '$app/forms';
  import CanvasFlow from '$lib/components/canvas/CanvasFlow.svelte';
  import GenNode from '$lib/components/canvas/GenNode.svelte';
  import IframeNode from '$lib/components/canvas/IframeNode.svelte';
  import DocNode from '$lib/components/canvas/DocNode.svelte';
  import { genNodeSize, type GenNode as GenNodeState, type GenMedium, type ModelChoice } from '$lib/canvas/gen-node';
  import { iframeNodeSize, type IframeNode as IframeNodeState } from '$lib/canvas/iframe-node';
  import { docNodeSize, shareUrlOf } from '$lib/canvas/doc-node';
  import { isGenAddable, type Addable } from '$lib/canvas/addable';
  import { tileNode } from '$lib/canvas/connect-rules';
  import { planDelete } from '$lib/canvas/delete-plan';
  import { docData, docOf, frameData, frameOf, genData, genOf, newNodeRow } from '$lib/canvas-node-data';
  import {
    EDGE_KIND_LABEL,
    isCanvasEdgeKind,
    type CanvasEdgeKind,
    type FlowEdge
  } from '$lib/canvas-edges';
  import type { CanvasNodeRecord, Connection } from '$lib/server/repos/canvas';

  let { data } = $props();

  /** Una riga come la pagina la tiene: quel che il database ha, più dove sta sullo schermo. */
  type Tile = {
    id: string;
    type: string;
    data: Record<string, unknown>;
    version: number;
    x: number;
    y: number;
    w: number;
    h: number;
  };

  function sizeOf(node: CanvasNodeRecord): { w: number; h: number } {
    if (node.type === 'iframe') {
      const { w, h } = iframeNodeSize();
      return { w: node.size.width ?? w, h: node.size.height ?? h };
    }

    if (node.type === 'doc') {
      const { w, h } = docNodeSize();
      return { w: node.size.width ?? w, h: node.size.height ?? h };
    }

    if (node.type === 'document') { return { w: node.size.width ?? 320, h: node.size.height ?? 120 }; }
    const { w, h } = genNodeSize(node.type as 'text' | 'image' | 'video');
    return { w: node.size.width ?? w, h: node.size.height ?? h };
  }

  function toTile(node: CanvasNodeRecord): Tile {
    return {
      id: node.id,
      type: node.type,
      data: node.data,
      version: node.version,
      x: node.position.x,
      y: node.position.y,
      ...sizeOf(node)
    };
  }

  let nodes = $state<Tile[]>((data.nodes as CanvasNodeRecord[]).map(toTile));

  /**
   * IL VERSO DI UNA LINEA STA SU `source_handle`. `nodes_connections` non ha una colonna per il
   * verso, e gli attacchi sono due — uno solo per lato — quindi quel campo è libero e porta
   * l'unica cosa che altrimenti si perderebbe: senza, riaprire la tela mostrerebbe ogni linea
   * tornata «nasce da», che è un dato falso scritto da nessuno.
   */
  function edgeKindOf(connection: Connection): CanvasEdgeKind {
    const handle = connection.sourceHandle ?? '';
    return isCanvasEdgeKind(handle) ? handle : 'derives_from';
  }

  function toEdge(connection: Connection): FlowEdge {
    const kind = edgeKindOf(connection);
    return {
      id: connection.id,
      source: connection.sourceNodeId,
      target: connection.targetNodeId,
      label: EDGE_KIND_LABEL[kind],
      kind,
      ...(kind === 'groups_with' ? {} : { markerEnd: { type: 'arrowclosed' as const } })
    };
  }

  let edges = $state<FlowEdge[]>((data.connections as Connection[]).map(toEdge));

  function toGenRun(run: {
    id: string;
    outputAssetId: string | null;
    prompt: string | null;
    model: string | null;
    startedAt: string;
    text?: string | null;
  }) {
    return {
      id: run.id,
      mediaId: run.outputAssetId,
      prompt: run.prompt ?? '',
      model: run.model,
      createdAt: run.startedAt,
      text: run.text ?? null
    };
  }

  const runsByNode = $derived(
    Object.fromEntries(
      Object.entries((data.runs ?? {}) as Record<string, unknown[]>).map(([id, rows]) => [
        id,
        (rows as Parameters<typeof toGenRun>[0][]).map(toGenRun)
      ])
    )
  );

  const catalogue = $derived(
    (data.catalogue ?? { text: [], image: [], video: [] }) as Record<GenMedium, ModelChoice[]>
  );

  /**
   * Quel che `CanvasFlow` disegna. `node` è ciò che serve a dire NO a un arco prima che nasca:
   * senza, `verdictBetween` non sa che tipo sia una tile e — per la sua regola, che è giusta —
   * lascia passare tutto.
   */
  const tiles = $derived(
    nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      connectable: true,
      node: tileNode({
        id: n.id,
        medium: n.type === 'iframe' || n.type === 'document' || n.type === 'doc' ? null : (n.type as 'text' | 'image' | 'video'),
        model: typeof n.data.model === 'string' ? n.data.model : null
      })
    }))
  );

  let failed = $state<string | null>(null);
  let peers = $state<PresencePeer[]>([]);
  let pending = 0;
  let snapshotVersion = 0;
  const enqueue = createWriteQueue();

  async function refresh() {
    const version = ++snapshotVersion;
    const snapshot = await post('snapshot', {});
    if (!snapshot || pending || version !== snapshotVersion) {
      return;
    }
    nodes = (snapshot.nodes as CanvasNodeRecord[]).map(toTile);
    edges = (snapshot.connections as Connection[]).map(toEdge);
  }

  $effect(() => {
    snapshotVersion += 1;
    nodes = (data.nodes as CanvasNodeRecord[]).map(toTile);
    edges = (data.connections as Connection[]).map(toEdge);
    const user = data.session?.user;
    if (!user) { return; }
    return connectCanvas({
      client: createSupabaseBrowserClient(),
      canvasId: data.canvas.id,
      peer: { userId: user.id, name: user.email ?? 'Utente', avatar: null,
        path: `/p/${data.projectId}/c/${data.canvas.id}`, threadId: null },
      onChange: () => { void refresh(); },
      onReconnect: () => { void refresh(); },
      onPeers: (value) => { peers = value; },
      onError: () => { failed = 'Connessione in tempo reale interrotta'; }
    });
  });

  /**
   * `x-sveltekit-action` distingue questa chiamata dall'invio di un form: senza, SvelteKit
   * risponde 303 verso la pagina, `fetch` segue il redirect da solo e torna l'HTML con `res.ok`
   * vero — si legge «salvato» mentre la tabella resta vuota. Lezione già pagata sulla tela di
   * prima, e vale identica qui.
   */
  async function post(
    action: string,
    fields: Record<string, string | number | File>
  ): Promise<Record<string, unknown> | null> {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      body.set(key, value instanceof File ? value : String(value));
    }

    const mutating = action !== 'snapshot';
    if (mutating) { pending += 1; snapshotVersion += 1; }
    try {
      const res = await fetch(`?/${action}`, {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
        body
      });
      const result = deserialize(await res.text());

      if (result.type !== 'success') {
        failed = 'non salvato';
        return null;
      }

      if (mutating) { failed = null; }
      return (result.data ?? null) as Record<string, unknown> | null;
    } catch {
      failed = 'non salvato';
      return null;
    } finally {
      if (mutating) { pending -= 1; snapshotVersion += 1; }
    }
  }

  /**
   * Un nodo nuovo. Compare SUBITO con l'id che il server gli darà? No: l'id lo conia il database,
   * quindi la tile nasce quando la riga torna. È mezzo secondo di attesa su un gesto che non si
   * ripete a raffica, e in cambio non esiste mai una tile senza riga dietro — quella su cui il
   * primo prompt scritto finirebbe su un id che non esiste.
   */
  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { return; }
    const result = await post('upload', { file, x: 0, y: 0 });
    const created = result?.node as CanvasNodeRecord | undefined;
    if (created) { nodes = [...nodes.filter((node) => node.id !== created.id), toTile(created)]; }
    input.value = '';
  }

  async function create(what: Addable, at: { x: number; y: number }) {
    const size = isGenAddable(what) ? genNodeSize(what) : what === 'doc' ? docNodeSize() : iframeNodeSize();
    const { w, h } = size;

    const res = await post('create', {
      type: what,
      x: at.x - w / 2,
      y: at.y - h / 2,
      data: JSON.stringify(newNodeRow(what))
    });

    const created = (res?.node ?? null) as CanvasNodeRecord | null;
    if (!created) {
      return;
    }

    nodes = [...nodes.filter((node) => node.id !== created.id), toTile(created)];
  }

  /**
   * SPOSTARE SI SCRIVE ALLA FINE DEL GESTO, non durante: `CanvasFlow` chiama qui su
   * `onNodeDragStop`, quindi un trascinamento è un `UPDATE` e non uno per fotogramma. Lo schermo
   * è già andato avanti da solo — la libreria muove il nodo mentre lo si trascina — e questa riga
   * porta la posizione dove vive davvero.
   */
  /**
   * FAR GIRARE UN NODO. Il bottone è già spento mentre gira (`canStartRun`), e la versione che
   * parte è quella che si ha in mano: se un altro ha scritto per primo il server risponde 409 e
   * qui si ricarica invece di pagare un giro su un prompt che non è più quello.
   */
  async function run(id: string, gen: GenNodeState) {
    const before = nodes.find((node) => node.id === id);
    if (!before || gen.running) {
      return;
    }

    nodes = nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, running: true } } : node));
    pending += 1;

    const result = await post('run', {
      node_id: id,
      medium: gen.medium,
      prompt: gen.prompt,
      model: gen.model ?? '',
      params: JSON.stringify(gen.params),
      version: before.version
    });
    pending -= 1;

    if (!result) {
      // Il motivo VERO sta già scritto su `nodes.data` — `giveUp()` lo mette lì prima di
      // tornare. Un messaggio fisso qui lo coprirebbe con un «non riuscita» che non dice niente
      // di più di uno spinner che si ferma: `refresh()` lo riporta dal server, dove `GenNode` sa
      // già mostrarlo (`node.error`).
      await refresh();
      return;
    }

    await refresh();
  }

  /**
   * SBLOCCARE UNA CORSA CHE NON TORNA. Ottimista come il trascinamento: subito spento sullo
   * schermo, e scritto solo alla fine — il nodo altrimenti resterebbe «in corso» a vita quando
   * il provider non risponde più o la scheda è stata chiusa a metà giro.
   */
  /** Rimettere in vetrina un giro di prima: lo decide il server, che sa quale asset è quel giro. */
  async function restore(id: string, gen: GenNodeState, runId: string) {
    const hit = (runsByNode[id] ?? []).find((r) => r.id === runId);
    if (hit?.mediaId) {
      nodes = nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, refId: hit.mediaId, running: false, error: null } }
          : node
      );
    }
    await post('restore', { node_id: id, run_id: runId });
    await refresh();
  }

  async function unlock(id: string) {
    const before = nodes.find((node) => node.id === id);
    if (!before) {
      return;
    }

    const data = { ...before.data, running: false, error: null };
    nodes = nodes.map((node) => (node.id === id ? { ...node, data } : node));
    await write(id, data);
  }

  async function move(id: string, x: number, y: number) {
    const before = nodes.find((node) => node.id === id);
    nodes = nodes.map((n) => (n.id === id ? { ...n, x, y } : n));

    const result = await post('move', { node_id: id, x, y });
    if (!result && before) {
      nodes = nodes.map((node) => node.id === id ? { ...node, x: before.x, y: before.y } : node);
    }
  }

  /**
   * IL CONTENUTO PASSA DALLA VERSIONE, e un conflitto non si ignora: il server risponde 409
   * quando qualcun altro ha scritto per primo, e qui si dice invece di credere di aver salvato.
   * La versione che torna sostituisce quella che si aveva, o la scrittura dopo fallirebbe uguale.
   */
  /**
   * UNA SCRITTURA PER GESTO, non per fotogramma: il client chiama qui quando il trascinamento
   * finisce. Il repository è last-write-wins apposta — due mani sullo stesso nodo si contendono
   * il puntatore, e nessuna delle due perde lavoro scritto.
   */
  async function share(id: string, on: boolean): Promise<{ url: string } | null> {
    const result = await post('share', { node_id: id, on: on ? 'true' : 'false' });
    if (!result) {
      return null;
    }

    nodes = nodes.map((node) =>
      node.id === id ? { ...node, data: { ...node.data, public: on } } : node
    );

    if (!on) {
      return { url: '' };
    }

    const url = shareUrlOf(window.location.origin, typeof result.path === 'string' ? result.path : null);
    return url ? { url } : null;
  }

  function write(id: string, patch: Record<string, unknown>) {
    const current = nodes.find((node) => node.id === id);
    if (!current) { return; }
    const next = { ...current.data, ...patch };
    nodes = nodes.map((node) => node.id === id ? { ...node, data: next } : node);
    pending += 1;
    void enqueue(id, async () => {
      const before = nodes.find((node) => node.id === id);
      if (!before) { pending -= 1; return; }
      const result = await post('write', {
        node_id: id, version: before.version, data: JSON.stringify(next)
      });
      const written = result?.node as CanvasNodeRecord | undefined;
      pending -= 1;
      if (!written) {
        failed = 'Contenuto non salvato: ricarica prima di continuare';
        return;
      }
      nodes = nodes.map((node) => node.id === id ? { ...node, version: written.version } : node);
      if (!pending) { void refresh(); }
    });
  }

  /**
   * Una linea NON si disegna prima che il server la restituisca: con un id inventato si finirebbe
   * per averla due volte appena la vera arriva. Il verso l'ha già scelto la tela guardando i due
   * estremi — `edgeKindsFor` — e qui si salva quello, non un `derives_from` fisso.
   */
  async function connect(source: string, target: string, kind: CanvasEdgeKind) {
    const res = await post('connect', {
      source_node_id: source,
      target_node_id: target,
      kind
    });

    const created = (res?.connection ?? null) as Connection | null;
    if (!created) {
      return;
    }

    edges = [...edges.filter((edge) => edge.id !== created.id), toEdge(created)];
  }

  /** Una linea tolta sparisce subito e torna se il server rifiuta: l'attesa qui si vedrebbe. */
  async function disconnect(connectionId: string) {
    const removed = edges.find((e) => e.id === connectionId);
    if (!removed) {
      return;
    }

    edges = edges.filter((e) => e.id !== connectionId);

    const done = await post('disconnect', { connection_id: connectionId });
    if (!done) {
      edges = [...edges, removed];
    }
  }

  /**
   * LE TILE TOLTE. `planDelete` dice cosa cade con loro — le linee verso un nodo che sparisce
   * resterebbero disegnate verso il vuoto fino al ricarico.
   *
   * Sparisce subito e torna se il server rifiuta: su una tela si lavora a gesti, e un nodo che
   * resta lì mezzo secondo dopo ⌫ fa premere ⌫ una seconda volta.
   */
  async function remove(ids: string[]) {
    const plan = planDelete({ ids, edges, undeletable: [] });
    if (plan.empty) {
      return;
    }

    const goneNodes = nodes.filter((n) => plan.itemIds.includes(n.id));
    const goneEdges = edges.filter((e) => plan.edgeIds.includes(e.id));

    nodes = nodes.filter((n) => !plan.itemIds.includes(n.id));
    edges = edges.filter((e) => !plan.edgeIds.includes(e.id));

    const done = await post('remove', {
      node_ids: plan.itemIds.join(','),
      connection_ids: plan.edgeIds.join(',')
    });
    if (done) {
      return;
    }

    nodes = [...nodes, ...goneNodes];
    edges = [...edges, ...goneEdges];
  }

  /**
   * IL VERSO DI UNA LINEA CHE C'È GIÀ non si corregge: sta su `source_handle`, e cambiarlo vuol
   * dire riscrivere la riga — una funzione che il repository non ha. Finché non c'è, `onEdgeRetype`
   * resta staccato e la linea si toglie e si rifà: un menù che non salva è peggio del menù che
   * manca.
   *
   * I MODELLI ARRIVANO DAL CATALOGO del server (`canvasModelCatalogue`), un menù per medium:
   * il testo è l'intero listino del gateway, immagine e video portano i limiti del modello.
   * «Genera» resta spento finché non c'è chi esegue il giro (fase 3).
   */
</script>

<svelte:head><title>dazero — {data.canvas.name}</title></svelte:head>

<div class="canvas">
  <label class="upload">Carica file<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,application/pdf,text/plain" onchange={upload} /></label>
  {#if peers.length}
    <div class="peers" aria-label="Persone sulla tela">{peers.map((peer) => peer.name).join(', ')}</div>
  {/if}
  {#if failed}
    <!-- Un salvataggio perso in silenzio si scopre alla prossima apertura, quando quel che si era
         scritto non c'è più e nessuno sa perché. -->
    <p class="warning" role="status">{failed}</p>
  {/if}

  <CanvasFlow
    {tiles}
    {edges}
    onMove={move}
    onConnect={connect}
    onDelete={remove}
    onEdgeDelete={disconnect}
    onCreate={create}
  >
    {#snippet tile({ id, selected })}
      {@const row = nodes.find((n) => n.id === id)}
      {#if row}
        {@const gen = genOf(row)}
        {@const frame = frameOf(row)}
        {@const doc = docOf(row)}
        {#if typeof row.data.assetId === 'string'}
          <div class="asset">
            {#if row.type === 'image'}
              <img src={String(row.data.url)} alt={String(row.data.name ?? '')} />
            {:else if row.type === 'video'}
              <video src={String(row.data.url)} controls playsinline><track kind="captions" /></video>
            {:else}
              <a href={String(row.data.url)} target="_blank" rel="noreferrer">{String(row.data.name ?? 'Documento')}</a>
            {/if}
          </div>
        {:else if gen}
          <GenNode
            node={{ ...gen, runs: runsByNode[row.id] ?? [] }}
            {selected}
            choices={catalogue[gen.medium]}
            onchange={(patch) => write(id, genData({ ...gen, ...patch }))}
            onrun={() => run(id, gen)}
            onunlock={() => unlock(id)}
            onshow={(runId) => restore(id, gen, runId)}
          >
            {#snippet result({ refId, text })}
              <!-- `/c/<tela>/assets/<id>` firma lo storage al volo: un URL firmato messo qui
                   scadrebbe in due ore, e una tela lasciata aperta tutto il giorno mostrerebbe
                   riquadri rotti. -->
              {#if gen.medium === 'text'}
                <pre class="gen-text">{text ?? ''}</pre>
              {:else if gen.medium === 'video'}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video src={`/p/${data.projectId}/c/${data.canvas.id}/assets/${refId}`} controls playsinline></video>
              {:else}
                <img src={`/p/${data.projectId}/c/${data.canvas.id}/assets/${refId}`} alt={gen.prompt} loading="lazy" />
              {/if}
            {/snippet}
          </GenNode>
        {:else if frame}
          <IframeNode node={frame} onchange={(patch) => write(id, frameData({ ...frame, ...patch }))} />
        {:else if doc}
          <DocNode
            node={doc}
            onchange={(patch) => write(id, docData({ ...doc, ...patch }))}
            onshare={(on) => share(id, on)}
          />
        {/if}
      {/if}
    {/snippet}
  </CanvasFlow>
</div>

<style>
  .canvas {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .upload { position: absolute; z-index: 10; top: 16px; left: 16px; background: white; padding: 8px; }
  .upload input { max-width: 200px; }
  .asset { width: 100%; height: 100%; background: white; padding: 12px; }
  .gen-text { width: 100%; height: 100%; margin: 0; padding: 12px; overflow: auto; white-space: pre-wrap; font: inherit; }
  .asset img, .asset video { width: 100%; height: 100%; object-fit: contain; }

  .peers { position: absolute; z-index: 10; right: 16px; top: 16px; }

  .warning {
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
</style>
