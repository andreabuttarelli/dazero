import type { Db } from '$lib/server/db/client';
import { fetchSocialFeed } from '$lib/server/social-feed-fetch';
import { upsertNodeSocialPosts } from '$lib/server/repos/social-posts';

/**
 * UN GIRO DI SINCRONIZZAZIONE PER UN NODO `social_account_feed`.
 *
 * Stesso patto di `products-sync.ts`: il nodo non appartiene a un brand, prende una piattaforma e
 * un handle e li scarica per conto suo — "prende un handler e scarica quello". Le righe finiscono
 * sotto il proprio `node_id` (`social_posts_node_id_external_id_key`), non su un brand condiviso.
 */
export type SocialFeedSyncOutcome =
  | { ok: true; synced: number }
  | { ok: false; error: string };

export async function syncSocialFeedNode(
  db: Db,
  input: {
    orgId: string;
    projectId: string | null;
    nodeId: string;
    platform: string;
    handle: string;
    limit: number;
  }
): Promise<SocialFeedSyncOutcome> {
  const fetched = await fetchSocialFeed(input.platform, input.handle, input.limit);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error };
  }

  const synced = await upsertNodeSocialPosts(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    nodeId: input.nodeId,
    platform: input.platform,
    handle: input.handle,
    posts: fetched.posts
  });

  return { ok: true, synced };
}
