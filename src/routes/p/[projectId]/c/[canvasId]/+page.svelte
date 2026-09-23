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
  import ProductsNode from '$lib/components/canvas/ProductsNode.svelte';
  import SocialFeedNode from '$lib/components/canvas/SocialFeedNode.svelte';
  import InfluencerNode from '$lib/components/canvas/InfluencerNode.svelte';
  import UploadedNode from '$lib/components/canvas/UploadedNode.svelte';
  import { verdictForUpload, canvasUploadPrefix } from '$lib/canvas/upload-kind';
  import { isUploadedNodeRow, uploadedNodeOf } from '$lib/canvas/uploaded-node';
  import { genNodeSize, type GenNode as GenNodeState, type GenMedium, type ModelChoice } from '$lib/canvas/gen-node';
  import { iframeNodeSize, type IframeNode as IframeNodeState } from '$lib/canvas/iframe-node';
  import { docNodeSize, shareUrlOf } from '$lib/canvas/doc-node';
  import { productsNodeSize } from '$lib/canvas/products-node';
  import { socialFeedNodeSize } from '$lib/canvas/social-feed-node';
  import { influencerNodeSize } from '$lib/canvas/influencer-node';
  import { isGenAddable, type Addable } from '$lib/canvas/addable';
  import type { FilledNodeDrag } from '$lib/canvas/drag-payload';
  import { tileNode } from '$lib/canvas/connect-rules';
  import { planDelete } from '$lib/canvas/delete-plan';
  import { connectorsFor, type ConnectorType } from '$lib/canvas/connectors';
  import { planConnectSelection, type ConnectSource } from '$lib/canvas/connect-selection-plan';
  import {
    docData,
    docOf,
    frameData,
    frameOf,
    genData,
    genOf,
    influencerOf,
    newNodeRow,
    productsData,
    productsOf,
    socialFeedData,
    socialFeedOf
  } from '$lib/canvas-node-data';
  import {
    EDGE_KIND_LABEL,
    isCanvasEdgeKind,
    type CanvasEdgeKind,
    type FlowEdge
  } from '$lib/canvas-edges';
  import type { CanvasNodeRecord, Connection } from '$lib/server/repos/canvas';
  import type { Product } from '$lib/server/repos/products';
  import type { SocialPost } from '$lib/server/repos/social-posts';

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

    if (node.type === 'products') {
      const { w, h } = productsNodeSize();
      return { w: node.size.width ?? w, h: node.size.height ?? h };
    }

    if (node.type === 'social_account_feed') {
      const { w, h } = socialFeedNodeSize();
      return { w: node.size.width ?? w, h: node.size.height ?? h };
    }

    if (node.type === 'influencer') {
      const { w, h } = influencerNodeSize();
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

  const mediumCatalogue = $derived(
    (data.catalogue ?? {
      text: { choices: [], synced: true },
      image: { choices: [], synced: false },
      video: { choices: [], synced: false }
    }) as Record<GenMedium, { choices: ModelChoice[]; synced: boolean }>
  );
  const catalogue = $derived(
    Object.fromEntries(
      Object.entries(mediumCatalogue).map(([medium, { choices }]) => [medium, choices])
    ) as Record<GenMedium, ModelChoice[]>
  );

  /**
   * IL CATALOGO E IL FEED SCARICATI, per nodo. Come `runsByNode`: `products`/`social_account_feed`
   * non portano il contenuto in `data.data` — vive in `products`/`social_posts` — quindi arriva
   * qui, letto dal server in `load` e riletto a ogni `refresh()`.
   */
  const productsByNode = $derived((data.products ?? {}) as Record<string, Product[]>);
  const socialPostsByNode = $derived((data.socialPosts ?? {}) as Record<string, SocialPost[]>);
  const influencersByNode = $derived(
    (data.influencers ?? {}) as Record<string, { name: string; views: { id: string; label: string; url: string | null }[] }>
  );

  /**
   * LE PORTE DI UN NODO CHE PRODUCE, dal modello scelto — mai un elenco scritto a mano. Un
   * modello assente dal catalogo (non sincronizzato: `offerableModels` non lo offre) disegna
   * ZERO porte piuttosto che indovinare: `choice` è `undefined` e la funzione torna `[]`.
   */
  function connectorsOfNode(n: Tile): ConnectorType[] | undefined {
    if (n.type !== 'text' && n.type !== 'image' && n.type !== 'video') { return undefined; }
    const model = typeof n.data.model === 'string' ? n.data.model : null;
    const choice = model ? catalogue[n.type]?.find((c) => c.id === model) : null;
    if (n.type !== 'text' && !choice) { return []; }
    return connectorsFor(n.type, { input: choice?.inputModalities ?? [] });
  }

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
      connectors: connectorsOfNode(n),
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

  let productsOverride = $state<Record<string, Product[]> | null>(null);
  let socialPostsOverride = $state<Record<string, SocialPost[]> | null>(null);
  const products = $derived(productsOverride ?? productsByNode);
  const socialPosts = $derived(socialPostsOverride ?? socialPostsByNode);

  async function refresh() {
    const version = ++snapshotVersion;
    const snapshot = await post('snapshot', {});
    if (!snapshot || pending || version !== snapshotVersion) {
      return;
    }
    nodes = (snapshot.nodes as CanvasNodeRecord[]).map(toTile);
    edges = (snapshot.connections as Connection[]).map(toEdge);
    productsOverride = (snapshot.products ?? {}) as Record<string, Product[]>;
    socialPostsOverride = (snapshot.socialPosts ?? {}) as Record<string, SocialPost[]>;
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
   * UN FILE VA DRITTO NELLO STORAGE DAL BROWSER, e solo il percorso arriva al server: lo stesso
   * schema di `StudioPage.svelte::handleImageUpload`, per la stessa ragione — un video o un
   * documento normale supera facilmente il corpo che un'azione SvelteKit regge su Vercel.
   *
   * Il nodo nasce SOLO quando la riga torna, come `create`: niente tile senza riga dietro.
   */
  const supabase = createSupabaseBrowserClient();

  async function upload(file: File) {
    const verdict = verdictForUpload(file.type, file.name, file.size);
    if (!verdict.ok) {
      failed = verdict.why;
      return;
    }

    const path = `${canvasUploadPrefix(data.orgId, data.projectId)}${crypto.randomUUID()}-${file.name}`;
    const up = await supabase.storage
      .from('canvas-assets')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (up.error) {
      failed = up.error.message;
      return;
    }

    const result = await post('upload', {
      path, file_name: file.name, mime_type: file.type, bytes: file.size, x: 0, y: 0
    });
    const created = result?.node as CanvasNodeRecord | undefined;
    if (created) { nodes = [...nodes.filter((node) => node.id !== created.id), toTile(created)]; }
  }

  function sizeForAddable(what: Addable): { w: number; h: number } {
    if (isGenAddable(what)) { return genNodeSize(what); }
    if (what === 'doc') { return docNodeSize(); }
    if (what === 'products') { return productsNodeSize(); }
    if (what === 'social_account_feed') { return socialFeedNodeSize(); }
    return iframeNodeSize();
  }

  async function create(what: Addable, at: { x: number; y: number }) {
    const { w, h } = sizeForAddable(what);

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
   * UN NODO CHE NASCE GIÀ PIENO — trascinato dalla libreria degli asset o dai brand, non dal menù
   * del doppio clic. Stessa forma di `create`, ma `type`/`data` arrivano dal trascinamento e non
   * da `newNodeRow`: il server li rivalida comunque (`validateNodeData`), perché un payload che
   * viaggia nel `dataTransfer` del browser non è meno un input esterno di un form.
   */
  async function createFilled(drag: FilledNodeDrag, at: { x: number; y: number }) {
    const res = await post('create', {
      type: drag.type,
      x: at.x - drag.w / 2,
      y: at.y - drag.h / 2,
      data: JSON.stringify(drag.data)
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
   *
   * `enqueue` PRIMA di leggere `before`: scegliere un modello scrive (`write`, sopra) e quella
   * scrittura aggiorna `nodes[].version` in locale solo quando il server risponde — scegliere e
   * premere Genera di seguito, senza la pausa di una mano vera fra i due gesti, altrimenti legge
   * la versione di prima del giro e il server risponde 409 su un prompt mai partito. Passare per
   * la stessa coda del nodo mette Genera in fila dietro quella scrittura invece di correrci
   * contro.
   */
  async function run(id: string, gen: GenNodeState) {
    if (gen.running) {
      return;
    }

    await enqueue(id, async () => {});

    const before = nodes.find((node) => node.id === id);
    if (!before) {
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

  /**
   * SINCRONIZZARE UN NODO `products` O `social_account_feed`. Ottimista sullo stato — "sta
   * scaricando" appare subito — ma il risultato lo scrive il server: qui non c'è modo di sapere
   * quanti prodotti o post sono arrivati prima che risponda.
   */
  async function sync(id: string) {
    const before = nodes.find((node) => node.id === id);
    if (!before) { return; }

    nodes = nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, sync_status: 'running' } } : node));
    pending += 1;

    const result = await post('sync', { node_id: id, version: before.version });
    pending -= 1;

    if (!result) {
      await refresh();
      return;
    }

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

  /**
   * "COLLEGA A NUOVO…": un nodo del tipo scelto nasce a destra della selezione, GIÀ CON UN
   * MODELLO — il primo del catalogo per quel medium — perché senza modello un nodo `image`/`video`
   * non ha porte (`connectorsOfNode`, sopra: `!choice` → `[]`), e il piano di collegamento
   * troverebbe zero connettori su un nodo appena nato. Il piano stesso (`planConnectSelection`) è
   * lo stesso che decide un collegamento a un nodo ESISTENTE (`connectExisting`, sotto): la
   * domanda "quale porta per quale sorgente" non cambia perché il bersaglio è appena nato.
   */
  async function connectNew(ids: string[], medium: GenMedium, at: { x: number; y: number }) {
    const sources: ConnectSource[] = nodes
      .filter((n) => ids.includes(n.id))
      .map((n) => ({ id: n.id, type: n.type }));
    if (!sources.length) { return; }

    const model = catalogue[medium]?.[0]?.id ?? null;
    const modalities = model ? { input: catalogue[medium].find((c) => c.id === model)?.inputModalities ?? [] } : { input: [] };

    const { w, h } = genNodeSize(medium);
    const created = await post('create', {
      type: medium,
      x: at.x - w / 2,
      y: at.y - h / 2,
      data: JSON.stringify({ ...newNodeRow(medium), model })
    });
    const node = (created?.node ?? null) as CanvasNodeRecord | null;
    if (!node) { return; }

    nodes = [...nodes.filter((n) => n.id !== node.id), toTile(node)];

    const plan = planConnectSelection({ sources, target: { kind: medium, modalities } });
    for (const wire of plan.wires) {
      const res = await post('connect', {
        source_node_id: wire.sourceId,
        target_node_id: node.id,
        kind: 'derives_from',
        target_handle: wire.connector
      });
      const connection = (res?.connection ?? null) as Connection | null;
      if (connection) { edges = [...edges.filter((e) => e.id !== connection.id), toEdge(connection)]; }
    }
    if (plan.rejected.length) {
      failed = `Non collegato: ${plan.rejected.map((r) => r.why).join('; ')}`;
    }
  }

  /**
   * "COLLEGA A…": la stessa domanda di `connectNew`, su un nodo che c'è già — le sue porte vengono
   * dal SUO modello attuale, non da uno appena scelto.
   */
  async function connectExisting(ids: string[], targetId: string) {
    const target = nodes.find((n) => n.id === targetId);
    if (!target || (target.type !== 'text' && target.type !== 'image' && target.type !== 'video')) {
      failed = 'Questo nodo non riceve collegamenti';
      return;
    }

    const sources: ConnectSource[] = nodes
      .filter((n) => ids.includes(n.id) && n.id !== targetId)
      .map((n) => ({ id: n.id, type: n.type }));
    if (!sources.length) { return; }

    const model = typeof target.data.model === 'string' ? target.data.model : null;
    const choice = model ? catalogue[target.type]?.find((c) => c.id === model) : null;
    const modalities = { input: choice?.inputModalities ?? [] };

    const plan = planConnectSelection({ sources, target: { kind: target.type, modalities } });
    for (const wire of plan.wires) {
      const res = await post('connect', {
        source_node_id: wire.sourceId,
        target_node_id: targetId,
        kind: 'derives_from',
        target_handle: wire.connector
      });
      const connection = (res?.connection ?? null) as Connection | null;
      if (connection) { edges = [...edges.filter((e) => e.id !== connection.id), toEdge(connection)]; }
    }
    if (plan.rejected.length) {
      failed = `Non collegato: ${plan.rejected.map((r) => r.why).join('; ')}`;
    }
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
   * ⌘D: duplica la selezione. Il server rilegge le righe VERE da `nodeIds` — la copia non fida
   * dello stato del client, che potrebbe avere una posizione o un contenuto non ancora salvato —
   * e restituisce nodi e linee già nati, pronti per lo stesso `toTile`/`toEdge` di ogni altra
   * creazione. Niente ottimismo qui: un duplicato che compare e poi sparisce (il server rifiuta)
   * è più confuso di un'attesa breve, e a differenza di un `move` non c'è "prima" a cui tornare.
   */
  async function duplicate(ids: string[]) {
    const result = await post('duplicate', { node_ids: ids.join(',') });
    const created = (result?.nodes ?? []) as CanvasNodeRecord[];
    const connected = (result?.connections ?? []) as Connection[];
    if (created.length) { nodes = [...nodes, ...created.map(toTile)]; }
    if (connected.length) { edges = [...edges, ...connected.map(toEdge)]; }
  }

  /**
   * ⌘C: gli APPUNTI SONO DI QUESTA TELA, in memoria — non del sistema operativo. Un `Ctrl+V` reale
   * del browser non saprebbe cosa incollare (che forma avrebbe un nodo `image` fuori da qui?), e
   * l'unico consumatore di questo copia è lo stesso ⌘V di `shortcuts.ts`. Portano `type`/`data`
   * intatti — l'incolla li rivalida comunque (`validateNodeData`, lato server) — e le posizioni
   * RELATIVE al centro della selezione: incollare altrove, o su un'altra tela della stessa org,
   * deve posare il gruppo dov'è il puntatore, non dov'era quando è stato copiato.
   */
  type Clipboard = {
    nodes: { type: string; data: Record<string, unknown>; dx: number; dy: number }[];
    edges: { sourceIndex: number; targetIndex: number; sourceHandle: string | null; targetHandle: string | null }[];
  };
  let clipboard = $state<Clipboard | null>(null);

  function copy(ids: string[]) {
    const chosen = nodes.filter((n) => ids.includes(n.id));
    if (!chosen.length) { return; }

    const indexOf = new Map(chosen.map((n, i) => [n.id, i]));
    const cx = chosen.reduce((sum, n) => sum + n.x, 0) / chosen.length;
    const cy = chosen.reduce((sum, n) => sum + n.y, 0) / chosen.length;

    clipboard = {
      nodes: chosen.map((n) => ({ type: n.type, data: n.data, dx: n.x - cx, dy: n.y - cy })),
      edges: edges
        .filter((e) => indexOf.has(e.source) && indexOf.has(e.target))
        .map((e) => ({
          sourceIndex: indexOf.get(e.source)!,
          targetIndex: indexOf.get(e.target)!,
          // Il verso viaggia su `source_handle` (vedi `connect`, sopra): `kind` è la stessa cosa
          // letta dal lato del client, che `toEdge` ha già tradotto all'ingresso.
          sourceHandle: e.kind,
          targetHandle: e.targetHandle ?? null
        }))
    };
  }

  /** ⌘V: quel che `copy` ha in mano, riposato attorno al punto dato — vuoto se non si è mai copiato. */
  async function paste(at: { x: number; y: number }) {
    if (!clipboard) { return; }

    const result = await post('paste', {
      nodes: JSON.stringify(clipboard.nodes.map((n) => ({ type: n.type, data: n.data, x: at.x + n.dx, y: at.y + n.dy }))),
      edges: JSON.stringify(clipboard.edges)
    });
    const created = (result?.nodes ?? []) as CanvasNodeRecord[];
    const connected = (result?.connections ?? []) as Connection[];
    if (created.length) { nodes = [...nodes, ...created.map(toTile)]; }
    if (connected.length) { edges = [...edges, ...connected.map(toEdge)]; }
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
  {#if peers.length}
    <div class="peers" aria-label="Persone sulla tela">{peers.map((peer) => peer.name).join(', ')}</div>
  {/if}
  {#if failed}
    <!-- Un salvataggio perso in silenzio si scopre alla prossima apertura, quando quel che si era
         scritto non c'è più e nessuno sa perché. -->
    <p class="warning" role="alert">{failed}</p>
  {/if}

  <CanvasFlow
    {tiles}
    {edges}
    onMove={move}
    onConnect={connect}
    onDelete={remove}
    onEdgeDelete={disconnect}
    onCreate={create}
    onCreateFilled={createFilled}
    onUpload={upload}
    onDuplicate={duplicate}
    onCopy={copy}
    onPaste={paste}
    onConnectNew={connectNew}
    onConnectExisting={connectExisting}
  >
    {#snippet tile({ id, selected })}
      {@const row = nodes.find((n) => n.id === id)}
      {#if row}
        {@const gen = genOf(row)}
        {@const frame = frameOf(row)}
        {@const doc = docOf(row)}
        {@const catalog = productsOf(row)}
        {@const feed = socialFeedOf(row)}
        {@const influencer = influencerOf(row)}
        {@const uploaded = isUploadedNodeRow(row) ? uploadedNodeOf(row) : null}
        {#if uploaded}
          <UploadedNode node={uploaded} medium={row.type === 'video' ? 'video' : 'image'} />
        {:else if gen}
          <GenNode
            node={{ ...gen, runs: runsByNode[row.id] ?? [] }}
            {selected}
            choices={mediumCatalogue[gen.medium].choices}
            catalogueSynced={mediumCatalogue[gen.medium].synced}
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
        {:else if catalog}
          <ProductsNode
            node={catalog}
            products={products[id] ?? []}
            onchange={(patch) => write(id, productsData({ ...catalog, ...patch }))}
            onsync={() => sync(id)}
          />
        {:else if feed}
          <SocialFeedNode
            node={feed}
            posts={socialPosts[id] ?? []}
            onchange={(patch) => write(id, socialFeedData({ ...feed, ...patch }))}
            onsync={() => sync(id)}
          />
        {:else if influencer}
          <InfluencerNode
            name={influencersByNode[id]?.name ?? 'Influencer'}
            views={influencersByNode[id]?.views ?? []}
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

  .gen-text { width: 100%; height: 100%; margin: 0; padding: 12px; overflow: auto; white-space: pre-wrap; font: inherit; }

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
    border-radius: 0;
  }
</style>
