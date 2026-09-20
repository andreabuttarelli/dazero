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

/** Gli stessi valori del check in migrazione: due elenchi divergerebbero al primo tipo nuovo. */
export const CANVAS_REF_KINDS = ['post', 'media', 'document', 'memory', 'graphic', 'note'] as const;

export type CanvasRefKind = (typeof CANVAS_REF_KINDS)[number];

export type CanvasItemRow = {
  id: string;
  canvas_id: string;
  brand_id: string;
  ref_kind: CanvasRefKind;
  ref_id: string | null;
  body: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** La versione che il browser rimanda indietro quando sposta: senza, l'ultimo che scrive vince. */
  updated_at: string;
};

type Row = Record<string, unknown>;

/** Un indice per tipo. La nota non compare: non punta a niente. */
export type CanvasRefs = Record<Exclude<CanvasRefKind, 'note'>, Map<string, Row>>;

export type CanvasItem = CanvasItemRow & {
  ref: Row | null;
  /** True quando la tile punta a un oggetto che non c'è più. */
  missing: boolean;
};

export function hydrateCanvasItems(rows: CanvasItemRow[], refs: CanvasRefs): CanvasItem[] {
  return rows.map((row) => {
    if (row.ref_kind === 'note') {
      return { ...row, ref: null, missing: false };
    }
    const ref = row.ref_id ? (refs[row.ref_kind]?.get(row.ref_id) ?? null) : null;
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
  if (!CANVAS_REF_KINDS.includes(input.refKind as CanvasRefKind) || input.refKind === 'note') {
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

/** Le colonne che ogni tipo porta sulla tela: abbastanza per disegnarla, non l'oggetto intero. */
const REF_SELECT: Record<Exclude<CanvasRefKind, 'note'>, { table: string; columns: string }> = {
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
    .select('id, canvas_id, brand_id, ref_kind, ref_id, body, x, y, w, h, z, updated_at')
    .eq('canvas_id', canvasId)
    .order('z');

  const rows = (data ?? []) as CanvasItemRow[];
  const refs = Object.fromEntries(
    Object.keys(REF_SELECT).map((kind) => [kind, new Map<string, Row>()])
  ) as CanvasRefs;
  if (!rows.length) return [];

  const byKind = new Map<Exclude<CanvasRefKind, 'note'>, string[]>();
  for (const row of rows) {
    if (row.ref_kind === 'note' || !row.ref_id) continue;
    const list = byKind.get(row.ref_kind) ?? [];
    list.push(row.ref_id);
    byKind.set(row.ref_kind, list);
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
