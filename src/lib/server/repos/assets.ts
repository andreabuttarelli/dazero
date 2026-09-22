import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';

/**
 * GLI ASSET: QUELLO CHE UN NODO PRODUCE, RIUSABILE ALTROVE.
 *
 * `project_id` è nullable — null è la libreria dell'org. Ed è proprio per questo che una lettura
 * per progetto DEVE portare `org_id`: `assets` è la tabella che il documento di schema indica
 * come il buco più facile, perché ha due colonne e una sola difende il tenant.
 */
type AssetRow = Database['public']['Tables']['assets']['Row'];

export const ASSET_TYPES = ['text', 'image', 'video', 'iframe', 'document'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_SOURCES = ['upload', 'generated', 'imported'] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export type Asset = {
  id: string;
  projectId: string | null;
  type: AssetType;
  url: string | null;
  content: string | null;
  mimeType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  source: AssetSource | null;
  sourceNodeId: string | null;
  createdAt: string;
};

const ASSET_COLUMNS =
  'id, project_id, type, url, content, mime_type, bytes, width, height, duration_s, source, source_node_id, created_at';

type AssetColumns = Omit<AssetRow, 'org_id' | 'embedding' | 'updated_at'>;

function toAsset(row: AssetColumns): Asset {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as AssetType,
    url: row.url,
    content: row.content,
    mimeType: row.mime_type,
    bytes: row.bytes === null ? null : Number(row.bytes),
    width: row.width,
    height: row.height,
    durationS: row.duration_s === null ? null : Number(row.duration_s),
    source: row.source as AssetSource | null,
    sourceNodeId: row.source_node_id,
    createdAt: row.created_at
  };
}

export async function listProjectAssets(
  db: Db,
  scope: { orgId: string; projectId: string; source?: AssetSource }
): Promise<Asset[]> {
  let query = db
    .from('assets')
    .select(ASSET_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('project_id', scope.projectId);

  if (scope.source) {
    query = query.eq('source', scope.source);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toAsset);
}

/** La libreria dell'org: gli asset senza progetto. */
export async function listOrgAssets(db: Db, orgId: string): Promise<Asset[]> {
  const { data, error } = await db
    .from('assets')
    .select(ASSET_COLUMNS)
    .eq('org_id', orgId)
    .is('project_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toAsset);
}

export async function findAsset(
  db: Db,
  input: { orgId: string; assetId: string }
): Promise<Asset | null> {
  const { data, error } = await db
    .from('assets')
    .select(ASSET_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.assetId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toAsset(data) : null;
}

export async function insertAsset(
  db: Db,
  input: {
    orgId: string;
    projectId: string | null;
    type: AssetType;
    source: AssetSource;
    url?: string | null;
    content?: string | null;
    mimeType?: string | null;
    bytes?: number | null;
    width?: number | null;
    height?: number | null;
    durationS?: number | null;
    sourceNodeId?: string | null;
  }
): Promise<Asset> {
  const { data, error } = await db
    .from('assets')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId,
      type: input.type,
      source: input.source,
      url: input.url ?? null,
      content: input.content ?? null,
      mime_type: input.mimeType ?? null,
      bytes: input.bytes ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      duration_s: input.durationS ?? null,
      source_node_id: input.sourceNodeId ?? null
    })
    .select(ASSET_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toAsset(data);
}

export async function deleteAsset(db: Db, input: { orgId: string; assetId: string }): Promise<void> {
  const { error } = await db.from('assets').delete().eq('org_id', input.orgId).eq('id', input.assetId);
  if (error) {
    throw error;
  }
}
