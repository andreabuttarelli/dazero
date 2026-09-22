import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';
import type { NormalizedPost } from '$lib/server/scrapecreators';

/**
 * I POST CHE UN NODO `social_account_feed` HA SCARICATO.
 *
 * `node_id` possiede la riga, non un brand: il nodo prende una piattaforma e un handle, non un
 * brand — la stessa scelta di `repos/products.ts`. `social_posts_node_id_external_id_key` è la
 * chiave dell'upsert: la stessa pagina letta due volte aggiorna la riga, mai la duplica.
 */
type SocialPostRow = Database['public']['Tables']['social_posts']['Row'];

export type SocialPost = {
  id: string;
  nodeId: string;
  projectId: string | null;
  platform: string;
  externalId: string;
  handle: string | null;
  caption: string | null;
  media: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  permalink: string | null;
  postedAt: string | null;
  fetchedAt: string;
};

const SOCIAL_POST_COLUMNS =
  'id, node_id, project_id, platform, external_id, handle, caption, media, metrics, permalink, posted_at, fetched_at';

type SocialPostColumns = Pick<
  SocialPostRow,
  | 'id'
  | 'node_id'
  | 'project_id'
  | 'platform'
  | 'external_id'
  | 'handle'
  | 'caption'
  | 'media'
  | 'metrics'
  | 'permalink'
  | 'posted_at'
  | 'fetched_at'
>;

function toSocialPost(row: SocialPostColumns): SocialPost {
  return {
    id: row.id,
    nodeId: row.node_id,
    projectId: row.project_id,
    platform: row.platform,
    externalId: row.external_id,
    handle: row.handle,
    caption: row.caption,
    media: (row.media ?? null) as Record<string, unknown> | null,
    metrics: (row.metrics ?? null) as Record<string, unknown> | null,
    permalink: row.permalink,
    postedAt: row.posted_at,
    fetchedAt: row.fetched_at
  };
}

export async function listNodeSocialPosts(
  db: Db,
  scope: { orgId: string; nodeId: string }
): Promise<SocialPost[]> {
  const { data, error } = await db
    .from('social_posts')
    .select(SOCIAL_POST_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('node_id', scope.nodeId)
    .order('posted_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toSocialPost);
}

function mediaOf(post: NormalizedPost): Record<string, unknown> {
  return {
    type: post.mediaType,
    thumbnailUrl: post.thumbnailUrl,
    videoUrl: post.videoUrl ?? null,
    durationMs: post.durationMs ?? null,
    hashtags: post.hashtags ?? []
  };
}

function metricsOf(post: NormalizedPost): Record<string, unknown> {
  return post.metrics ?? {};
}

export async function upsertNodeSocialPosts(
  db: Db,
  input: { orgId: string; projectId: string | null; nodeId: string; platform: string; handle: string; posts: NormalizedPost[] }
): Promise<number> {
  if (!input.posts.length) {
    return 0;
  }

  const fetchedAt = new Date().toISOString();
  const rows = input.posts.map((post) => ({
    org_id: input.orgId,
    project_id: input.projectId,
    node_id: input.nodeId,
    platform: input.platform,
    external_id: post.externalId,
    handle: input.handle,
    caption: post.content,
    media: mediaOf(post),
    metrics: metricsOf(post),
    permalink: post.url,
    posted_at: post.publishedAt,
    fetched_at: fetchedAt
  }));

  const { error } = await db.from('social_posts').upsert(rows, { onConflict: 'node_id,external_id' });

  if (error) {
    throw error;
  }
  return rows.length;
}

export async function deleteNodeSocialPosts(db: Db, scope: { orgId: string; nodeId: string }): Promise<void> {
  const { error } = await db.from('social_posts').delete().eq('org_id', scope.orgId).eq('node_id', scope.nodeId);

  if (error) {
    throw error;
  }
}
