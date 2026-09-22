import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';

/**
 * IL POST È DEL BRAND, NON DEL PROGETTO.
 *
 * Il canvas è materiale grezzo; il post è la cosa che può uscire. Un post mette insieme pezzi di
 * tele diverse, quindi legarlo a un progetto costringerebbe a sceglierne uno e la risposta giusta
 * non esiste. La provenienza resta, ed è molti-a-molti: `post_sources` dice da quali nodi è nato,
 * su qualunque tela stiano.
 */
type PostRow = Database['public']['Tables']['posts']['Row'];

export const POST_STATUSES = ['draft', 'ready', 'archived'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const ACTOR_KINDS = ['user', 'agent', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export type PostMedia = { assetId: string; order: number; role?: string };

export type Post = {
  id: string;
  brandId: string;
  title: string | null;
  caption: string;
  perPlatform: Record<string, unknown> | null;
  media: PostMedia[];
  linkUrl: string | null;
  status: PostStatus;
  createdAt: string;
};

export type PostSource = { postId: string; nodeId: string; role: string | null };

const POST_COLUMNS =
  'id, brand_id, title, caption, per_platform, media, link_url, status, created_at';

type PostColumns = Pick<
  PostRow,
  'id' | 'brand_id' | 'title' | 'caption' | 'per_platform' | 'media' | 'link_url' | 'status' | 'created_at'
>;

function toPost(row: PostColumns): Post {
  return {
    id: row.id,
    brandId: row.brand_id,
    title: row.title,
    caption: row.caption,
    perPlatform: (row.per_platform as Record<string, unknown> | null) ?? null,
    media: ((row.media ?? []) as unknown as PostMedia[]),
    linkUrl: row.link_url,
    status: row.status as PostStatus,
    createdAt: row.created_at
  };
}

export async function listPosts(
  db: Db,
  scope: { orgId: string; brandId: string; status?: PostStatus }
): Promise<Post[]> {
  let query = db
    .from('posts')
    .select(POST_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('brand_id', scope.brandId);

  if (scope.status) {
    query = query.eq('status', scope.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toPost);
}

export async function findPost(
  db: Db,
  input: { orgId: string; postId: string }
): Promise<Post | null> {
  const { data, error } = await db
    .from('posts')
    .select(POST_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.postId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toPost(data) : null;
}

/**
 * La promozione: da materiale a contenuto. `sources` non è un extra — è il ritorno alla tela per
 * rigenerare, e senza di lui il canvas perde senso appena il post esiste.
 */
export async function promoteToPost(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    caption: string;
    media: PostMedia[];
    title?: string | null;
    linkUrl?: string | null;
    perPlatform?: Record<string, unknown> | null;
    actorKind?: ActorKind;
    actorId?: string | null;
    sources?: { nodeId: string; role?: string }[];
  }
): Promise<Post> {
  const { data, error } = await db
    .from('posts')
    .insert({
      org_id: input.orgId,
      brand_id: input.brandId,
      title: input.title ?? null,
      caption: input.caption,
      media: input.media,
      link_url: input.linkUrl ?? null,
      per_platform: (input.perPlatform ?? null) as Database['public']['Tables']['posts']['Insert']['per_platform'],
      actor_kind: input.actorKind ?? 'user',
      actor_id: input.actorId ?? null
    })
    .select(POST_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  const post = toPost(data);
  if (input.sources?.length) {
    await linkSources(db, { postId: post.id, sources: input.sources });
  }
  return post;
}

export async function linkSources(
  db: Db,
  input: { postId: string; sources: { nodeId: string; role?: string }[] }
): Promise<void> {
  const { error } = await db.from('post_sources').insert(
    input.sources.map((s) => ({
      post_id: input.postId,
      node_id: s.nodeId,
      role: s.role ?? null
    }))
  );

  if (error) {
    throw error;
  }
}

export async function listSources(db: Db, postId: string): Promise<PostSource[]> {
  const { data, error } = await db
    .from('post_sources')
    .select('post_id, node_id, role')
    .eq('post_id', postId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    postId: row.post_id,
    nodeId: row.node_id,
    role: row.role
  }));
}

export async function setPostStatus(
  db: Db,
  input: { orgId: string; postId: string; status: PostStatus }
): Promise<void> {
  const { error } = await db
    .from('posts')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.postId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}
