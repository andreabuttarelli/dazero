import type { Db } from '$lib/server/db/client';
import type { Database, Json } from '$lib/database.types';

/**
 * UN VOLTO RIUSABILE, E LE SUE VISTE.
 *
 * Due tabelle, come `nodes`/`assets`: `influencers` porta l'anagrafica, `influencer_views` le
 * immagini. `org_id is null` è il catalogo globale — ogni org lo legge, nessuna lo scrive (lo
 * semina `scripts/import-anomalia-talents.ts` con la service-role key). `listInfluencers` porta
 * SEMPRE le due platee insieme: un catalogo senza i propri, o viceversa, non è mai la domanda che
 * un pannello fa.
 */
type InfluencerRow = Database['public']['Tables']['influencers']['Row'];
type InfluencerViewRow = Database['public']['Tables']['influencer_views']['Row'];

export type Influencer = {
  id: string;
  orgId: string | null;
  templateOf: string | null;
  name: string;
  slug: string;
  gender: string | null;
  age: number | null;
  ethnicity: string | null;
  bodyType: string | null;
  heightBand: string | null;
  summary: string | null;
  traits: Record<string, unknown>;
  source: 'catalogue' | 'generated' | 'upload';
  builder: Record<string, unknown> | null;
  consent: boolean;
  createdAt: string;
};

export type InfluencerView = {
  id: string;
  influencerId: string;
  viewKey: string;
  label: string;
  storagePath: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
};

const INFLUENCER_COLUMNS =
  'id, org_id, template_of, name, slug, gender, age, ethnicity, body_type, height_band, summary, traits, source, builder, consent, created_at';

const VIEW_COLUMNS = 'id, influencer_id, view_key, label, storage_path, mime_type, width, height, sort_order';

function toInfluencer(row: Pick<InfluencerRow, keyof InfluencerRow>): Influencer {
  return {
    id: row.id,
    orgId: row.org_id,
    templateOf: row.template_of,
    name: row.name,
    slug: row.slug,
    gender: row.gender,
    age: row.age,
    ethnicity: row.ethnicity,
    bodyType: row.body_type,
    heightBand: row.height_band,
    summary: row.summary,
    traits: (row.traits ?? {}) as Record<string, unknown>,
    source: row.source as Influencer['source'],
    builder: row.builder as Record<string, unknown> | null,
    consent: row.consent,
    createdAt: row.created_at
  };
}

function toView(row: Pick<InfluencerViewRow, keyof InfluencerViewRow>): InfluencerView {
  return {
    id: row.id,
    influencerId: row.influencer_id,
    viewKey: row.view_key,
    label: row.label,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sortOrder: row.sort_order
  };
}

/**
 * CATALOGO + PROPRI, sempre insieme: la RLS già filtra `org_id is null or org_id in (...)` per
 * chiunque abbia una sessione, quindi qui basta chiedere senza un `.eq('org_id', ...)` — metterlo
 * ristringerebbe a una sola platea, l'opposto di quel che il pannello Influencers deve mostrare.
 */
export async function listInfluencers(db: Db): Promise<Influencer[]> {
  const { data, error } = await db
    .from('influencers')
    .select(INFLUENCER_COLUMNS)
    .is('deleted_at', null)
    .order('source', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toInfluencer);
}

export async function getInfluencer(db: Db, influencerId: string): Promise<Influencer | null> {
  const { data, error } = await db
    .from('influencers')
    .select(INFLUENCER_COLUMNS)
    .eq('id', influencerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toInfluencer(data) : null;
}

export async function listInfluencerViews(db: Db, influencerId: string): Promise<InfluencerView[]> {
  const { data, error } = await db
    .from('influencer_views')
    .select(VIEW_COLUMNS)
    .eq('influencer_id', influencerId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toView);
}

export async function listInfluencerViewsByIds(db: Db, influencerIds: string[]): Promise<Map<string, InfluencerView[]>> {
  const out = new Map<string, InfluencerView[]>();
  if (!influencerIds.length) {
    return out;
  }

  const { data, error } = await db
    .from('influencer_views')
    .select(VIEW_COLUMNS)
    .in('influencer_id', influencerIds)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }
  for (const row of data ?? []) {
    const view = toView(row);
    const list = out.get(view.influencerId) ?? [];
    list.push(view);
    out.set(view.influencerId, list);
  }
  return out;
}

export type CreateInfluencerInput = {
  orgId: string;
  templateOf?: string | null;
  name: string;
  slug: string;
  gender?: string | null;
  age?: number | null;
  ethnicity?: string | null;
  bodyType?: string | null;
  heightBand?: string | null;
  summary?: string | null;
  traits?: Record<string, unknown>;
  source: 'generated' | 'upload';
  builder?: Record<string, unknown> | null;
  consent?: boolean;
  actorKind: 'user' | 'agent' | 'system';
  actorId: string | null;
};

export async function createInfluencer(db: Db, input: CreateInfluencerInput): Promise<Influencer> {
  const { data, error } = await db
    .from('influencers')
    .insert({
      org_id: input.orgId,
      template_of: input.templateOf ?? null,
      name: input.name,
      slug: input.slug,
      gender: input.gender ?? null,
      age: input.age ?? null,
      ethnicity: input.ethnicity ?? null,
      body_type: input.bodyType ?? null,
      height_band: input.heightBand ?? null,
      summary: input.summary ?? null,
      traits: (input.traits ?? {}) as Json,
      source: input.source,
      builder: (input.builder ?? null) as Json,
      consent: input.consent ?? false,
      actor_kind: input.actorKind,
      actor_id: input.actorId
    })
    .select(INFLUENCER_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toInfluencer(data);
}

export type CreateInfluencerViewInput = {
  orgId: string | null;
  influencerId: string;
  viewKey: string;
  label: string;
  storagePath: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  sortOrder: number;
};

export async function insertInfluencerViews(db: Db, views: CreateInfluencerViewInput[]): Promise<InfluencerView[]> {
  if (!views.length) {
    return [];
  }

  const { data, error } = await db
    .from('influencer_views')
    .insert(
      views.map((v) => ({
        org_id: v.orgId,
        influencer_id: v.influencerId,
        view_key: v.viewKey,
        label: v.label,
        storage_path: v.storagePath,
        mime_type: v.mimeType ?? null,
        width: v.width ?? null,
        height: v.height ?? null,
        sort_order: v.sortOrder
      }))
    )
    .select(VIEW_COLUMNS);

  if (error) {
    throw error;
  }
  return (data ?? []).map(toView);
}
