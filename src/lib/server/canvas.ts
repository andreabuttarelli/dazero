/**
 * LA TELA: dove stanno le cose, e le cose stesse lette da dove vivono.
 *
 * Una tile porta un riferimento e una posizione, mai una copia di ciò che mostra. Il post resta in
 * `posts`, il media in `brand_media`, il documento in `brand_documents`: copiarne il contenuto qui
 * darebbe due verità sullo stesso oggetto, e una tela che il giorno dopo mostra un titolo vecchio.
 * È la stessa scelta di `graphic_designs`, che tiene la spec e non i pixel.
 *
 * QUINDI L'IDRATAZIONE È IL LAVORO. Le righe delle tile arrivano da una query; gli oggetti da
 * altre cinque, una per tipo, raggruppate per id. Una query per tile sarebbe N+1 su una tela che
 * per definizione ne ha molte.
 *
 * UN OGGETTO SPARITO NON FA SPARIRE LA TILE. Non c'è cascata dal referente, ed è deliberato: un
 * post cancellato lascia un riquadro che dice «questa cosa non c'è più». Svanire di soppiatto da
 * una tela che qualcuno sta guardando è il modo peggiore di dare la notizia, e toglie anche la
 * possibilità di rimettere qualcosa al suo posto.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CANVAS_EDGE_KINDS, type CanvasEdgeKind, type CanvasEdgeRow } from '$lib/canvas-edges';
import type { GenMedium } from '$lib/canvas/gen-node';

/** Gli stessi valori del check in migrazione: due elenchi divergerebbero al primo tipo nuovo. */
export const CANVAS_REF_KINDS = [
  'post',
  'media',
  'document',
  'memory',
  'graphic',
  'note',
  // Il nodo che produce: nasce senza riferimento e lo acquista girando. Vedi `canvas-gen.ts`.
  'gen',
  // La pagina incorporata: porta il suo contenuto — un indirizzo o dell'HTML — e non punta a
  // nessuna riga, mai. Vedi `canvas-iframe.ts`.
  'iframe'
] as const;

export type CanvasRefKind = (typeof CANVAS_REF_KINDS)[number];

export type CanvasItemRow = {
  id: string;
  canvas_id: string;
  brand_id: string;
  ref_kind: CanvasRefKind;
  ref_id: string | null;
  body: string | null;
  /**
   * Le quattro colonne del nodo che PRODUCE. Null su ogni altro tipo: una tile che punta a un post
   * non ha un prompt, e il medium glielo porta il post.
   *
   * Facoltative nel TIPO e non solo nel valore, perché una tela letta con un `select` più stretto
   * — e ce n'è uno, in `ensureBrandCanvas` — non le porta affatto: dichiararle presenti costringe
   * ogni lettura parziale a inventarle.
   */
  medium?: GenMedium | null;
  model?: string | null;
  prompt?: string | null;
  params?: Record<string, unknown> | null;
  /**
   * I due modi di riempire una pagina incorporata, e ne vale UNO SOLO alla volta — il vincolo
   * `brand_canvas_items_iframe_source` non lascia esistere una riga con entrambi o con nessuno.
   * Null su ogni altro tipo. Facoltative nel tipo per la stessa ragione delle quattro sopra.
   */
  url?: string | null;
  html?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** La versione che il browser rimanda indietro quando sposta: senza, l'ultimo che scrive vince. */
  updated_at: string;
};

type Row = Record<string, unknown>;

/**
 * I tipi che puntano DAVVERO a una riga di un'altra tabella. Fuori restano quelli che il contenuto
 * se lo portano: la nota col suo testo, la pagina incorporata col suo indirizzo o il suo HTML, e
 * il nodo che produce, che il riferimento lo acquista solo dopo aver girato.
 */
export type CanvasRefKindWithRow = Exclude<CanvasRefKind, 'note' | 'gen' | 'iframe'>;

/**
 * Dove sta il risultato di un nodo che ha prodotto: in `brand_media`, come ogni altro asset del
 * brand. Il nodo non ha una tabella sua — sarebbe una seconda libreria — quindi `ref_kind = 'gen'`
 * si idrata di lì, ed è l'unico tipo il cui nome non è quello della sua tabella.
 */
const GEN_REF_TABLE = 'media' satisfies CanvasRefKindWithRow;

/** Un indice per tipo, per idratare senza una query per tile. */
export type CanvasRefs = Record<CanvasRefKindWithRow, Map<string, Row>>;

export type CanvasItem = CanvasItemRow & {
  ref: Row | null;
  /** True quando la tile punta a un oggetto che non c'è più. */
  missing: boolean;
};

/**
 * I tipi che il contenuto se lo portano dentro: nessuno di loro va cercato in un'altra tabella, e
 * nessuno di loro può essere `missing` — non è sparito niente, non c'è mai stata una riga.
 *
 * Un elenco invece di un `if` per tipo: al quarto caso sarebbero tre condizioni sparse da tenere
 * d'accordo, che è il modo in cui `gen` si era già disegnato «questa cosa non c'è più» addosso.
 */
const SELF_CONTAINED_KINDS = ['note', 'iframe'] as const;

type SelfContainedKind = (typeof SELF_CONTAINED_KINDS)[number];

/**
 * Un predicato e non un `includes` nudo: così il compilatore SA che dopo questa guardia il tipo
 * non può più essere `note` né `iframe`, e l'accesso a `REF_SELECT` è provato invece che sperato.
 * Senza, resta lecito scrivere `REF_SELECT[kind]` su un tipo che non ha riga — che è il
 * `TypeError` con cui un nodo `gen` riuscito rendeva illeggibile l'intera tela.
 */
function carriesOwnContent(kind: CanvasRefKind): kind is SelfContainedKind {
  return (SELF_CONTAINED_KINDS as readonly CanvasRefKind[]).includes(kind);
}

export function hydrateCanvasItems(rows: CanvasItemRow[], refs: CanvasRefs): CanvasItem[] {
  return rows.map((row) => {
    // Chi porta il proprio contenuto non cerca niente, e il nodo che produce non ci punta ANCORA:
    // in entrambi i casi `missing` dipingerebbe «questa cosa non c'è più» su qualcosa che non è
    // mai sparito.
    if (carriesOwnContent(row.ref_kind) || (row.ref_kind === 'gen' && !row.ref_id)) {
      return { ...row, ref: null, missing: false };
    }
    const kind = row.ref_kind === 'gen' ? GEN_REF_TABLE : row.ref_kind;
    const ref = row.ref_id ? (refs[kind]?.get(row.ref_id) ?? null) : null;
    return { ...row, ref, missing: !ref };
  });
}

/** Dove una tile è stata lasciata, indicizzata per `<tipo>:<id>` — la chiave che il client usa. */
export type Placements = Record<string, { x: number; y: number; w: number; h: number }>;

/**
 * La tela del brand, creandola se è la prima volta che qualcuno la apre.
 *
 * UNA TELA PER BRAND, per ora. Quando ne serviranno più d'una questa funzione prenderà un nome e
 * il resto resterà com'è: la tabella regge già N tele, è il prodotto che non ha ancora la domanda.
 */
export async function ensureBrandCanvas(
  supabase: SupabaseClient,
  brandId: string
): Promise<{ id: string; placements: Placements } | null> {
  const existing = await supabase
    .from('brand_canvases')
    .select('id')
    .eq('brand_id', brandId)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  let canvasId = existing.data?.id as string | undefined;
  if (!canvasId) {
    const created = await supabase
      .from('brand_canvases')
      .insert({ brand_id: brandId })
      .select('id')
      .maybeSingle();
    canvasId = created.data?.id as string | undefined;
  }
  if (!canvasId) return null;

  const { data } = await supabase
    .from('brand_canvas_items')
    .select('ref_kind, ref_id, x, y, w, h')
    .eq('canvas_id', canvasId);

  const placements: Placements = {};
  for (const row of data ?? []) {
    if (!row.ref_id) continue;
    placements[`${row.ref_kind}:${row.ref_id}`] = { x: row.x, y: row.y, w: row.w, h: row.h };
  }
  return { id: canvasId, placements };
}

export type SavePosition = {
  brandId: string;
  userId: string;
  canvasId: string;
  refKind: string;
  refId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Dove una tile è finita. Un upsert, non un insert: la stessa cosa spostata due volte deve avere
 * una riga sola, e l'indice unico su `(canvas_id, ref_kind, ref_id)` è ciò che lo rende possibile.
 *
 * I CONTROLLI PRIMA DELLA SCRITTURA, perché i vincoli del database boccerebbero comunque ma con un
 * SQLSTATE che non dice niente a chi ha solo trascinato un riquadro. Un `NaN` arriva davvero: è un
 * trascinamento interrotto, e scritto darebbe una tile irraggiungibile che nessuno può più
 * spostare perché non si vede.
 */
export async function saveCanvasPositions(
  supabase: SupabaseClient,
  input: SavePosition
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Questa strada ritrova una tile dal suo REFERENTE, quindi vale solo per chi ne ha uno: chi il
  // contenuto se lo porta si sposta per id di riga, con `moveCanvasItem`.
  if (
    !CANVAS_REF_KINDS.includes(input.refKind as CanvasRefKind) ||
    carriesOwnContent(input.refKind as CanvasRefKind)
  ) {
    return { ok: false, error: `ref_kind non ammesso: ${input.refKind}` };
  }
  if (!input.canvasId || !input.refId) {
    return { ok: false, error: 'canvas_id e ref_id sono obbligatori' };
  }
  for (const [name, value] of [['x', input.x], ['y', input.y], ['w', input.w], ['h', input.h]] as const) {
    if (!Number.isFinite(value)) return { ok: false, error: `${name} non è un numero` };
  }
  if (input.w <= 0 || input.h <= 0) {
    return { ok: false, error: 'larghezza e altezza devono essere positive' };
  }

  const { error } = await supabase.from('brand_canvas_items').upsert(
    {
      canvas_id: input.canvasId,
      brand_id: input.brandId,
      ref_kind: input.refKind,
      ref_id: input.refId,
      x: input.x,
      y: input.y,
      w: input.w,
      h: input.h,
      created_by: input.userId
    },
    { onConflict: 'canvas_id,ref_kind,ref_id' }
  );

  return error ? { ok: false, error: error.message } : { ok: true };
}

export type SaveEdge = {
  brandId: string;
  userId: string;
  canvasId: string;
  sourceItemId: string;
  targetItemId: string;
  kind: string;
  label?: string | null;
};

/**
 * Una connessione fra due tile. Un upsert come per le posizioni, e per la stessa ragione: la
 * stessa linea tirata due volte deve restare una riga sola.
 *
 * I CONTROLLI PRIMA DELLA SCRITTURA, e qui più che per le posizioni, perché chi scrive è spesso un
 * agente: un `kind` inventato bocciato da Postgres torna come 23514 che nomina un vincolo, e chi
 * lo legge riprova con un'altra invenzione. Nominare le tre parole ammesse chiude il giro al primo
 * tentativo invece che al terzo.
 */
export async function saveCanvasEdge(
  supabase: SupabaseClient,
  input: SaveEdge
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CANVAS_EDGE_KINDS.includes(input.kind as CanvasEdgeKind)) {
    return { ok: false, error: `kind non ammesso: ${input.kind}. Sono ${CANVAS_EDGE_KINDS.join(', ')}.` };
  }
  if (!input.canvasId || !input.sourceItemId || !input.targetItemId) {
    return { ok: false, error: 'canvas_id, source_item_id e target_item_id sono obbligatori' };
  }
  if (input.sourceItemId === input.targetItemId) {
    return { ok: false, error: 'una tile non si collega a se stessa' };
  }

  const { error } = await supabase.from('brand_canvas_edges').upsert(
    {
      canvas_id: input.canvasId,
      brand_id: input.brandId,
      source_item_id: input.sourceItemId,
      target_item_id: input.targetItemId,
      kind: input.kind,
      label: input.label?.trim() || null,
      created_by: input.userId
    },
    { onConflict: 'canvas_id,source_item_id,target_item_id,kind' }
  );

  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Le linee di una tela, nella forma che il disegno vuole. */
export async function loadCanvasEdges(
  supabase: SupabaseClient,
  canvasId: string
): Promise<CanvasEdgeRow[]> {
  const { data } = await supabase
    .from('brand_canvas_edges')
    .select('id, source_item_id, target_item_id, kind, label')
    .eq('canvas_id', canvasId);

  return (data ?? []) as CanvasEdgeRow[];
}

/** Le colonne che ogni tipo porta sulla tela: abbastanza per disegnarla, non l'oggetto intero. */
const REF_SELECT: Record<CanvasRefKindWithRow, { table: string; columns: string }> = {
  post: { table: 'posts', columns: 'id, caption, media_url, media_urls, platform, status, content_type, scheduled_for' },
  media: { table: 'brand_media', columns: 'id, kind, url, storage_path, title, file_name, width, height' },
  document: { table: 'brand_documents', columns: 'id, title, kind, status, summary' },
  memory: { table: 'brand_memory', columns: 'id, key, value, category, importance' },
  graphic: { table: 'graphic_designs', columns: 'id, media_url, version, target_kind, target_id' }
};

/**
 * Le tile di una tela, con gli oggetti attaccati. Una query per TIPO presente, non per tile.
 *
 * Le righe arrivano dal client dell'utente, quindi le RLS decidono cosa si vede: una tile che
 * punta a un post di un altro brand torna `missing` invece di rivelarlo — il cancello è di
 * Postgres, non di questa funzione.
 */
export async function loadCanvasItems(
  supabase: SupabaseClient,
  canvasId: string
): Promise<CanvasItem[]> {
  const { data } = await supabase
    .from('brand_canvas_items')
    .select(
      'id, canvas_id, brand_id, ref_kind, ref_id, body, medium, model, prompt, params, url, html, x, y, w, h, z, updated_at'
    )
    .eq('canvas_id', canvasId)
    .order('z');

  const rows = (data ?? []) as CanvasItemRow[];
  const refs = Object.fromEntries(
    Object.keys(REF_SELECT).map((kind) => [kind, new Map<string, Row>()])
  ) as CanvasRefs;
  if (!rows.length) return [];

  const byKind = new Map<CanvasRefKindWithRow, string[]>();
  for (const row of rows) {
    // Il filtro è sul TIPO prima che sul valore: un tipo che si porta il contenuto non ha una
    // riga in `REF_SELECT`, e arrivarci significherebbe `spec.table` su `undefined` — cioè
    // l'intera tela illeggibile per una tile sola. È il difetto che `gen` ha già pagato.
    if (carriesOwnContent(row.ref_kind) || !row.ref_id) continue;
    const kind = row.ref_kind === 'gen' ? GEN_REF_TABLE : row.ref_kind;
    const list = byKind.get(kind) ?? [];
    list.push(row.ref_id);
    byKind.set(kind, list);
  }

  await Promise.all(
    [...byKind].map(async ([kind, ids]) => {
      const spec = REF_SELECT[kind];
      const { data: found } = await supabase.from(spec.table).select(spec.columns).in('id', ids);
      for (const ref of (found ?? []) as unknown as Row[]) {
        refs[kind].set(String(ref.id), ref);
      }
    })
  );

  return hydrateCanvasItems(rows, refs);
}
