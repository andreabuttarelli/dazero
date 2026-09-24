import type { Db } from '$lib/server/db/client';
import type { SocialPublisher } from '$lib/server/publishing/port';
import type { Post, PostStatus } from '$lib/server/repos/posts';
import type { DeliveryOutcome } from '$lib/server/repos/post-delivery';

/**
 * DALLA SELEZIONE DEL CANVAS A UN POST, CON O SENZA PROGRAMMAZIONE — la porta unica per la UI. Non
 * un secondo percorso: dentro chiama `promoteNodesToPost` per la promozione e `scheduleDelivery`
 * per l'uscita, con le stesse regole che il calendario usa già.
 *
 * `mode` distingue un post che resta `draft` da uno che va programmato — mai un booleano, perché
 * "programmato" porta con sé un orario che un `true`/`false` non può portare.
 */
export type CreatePostMode = { kind: 'draft' } | { kind: 'schedule'; at: string };

export type CreatePostResult =
  | { ok: true; post: Post }
  | { ok: false; error: 'brand_not_found' }
  | { ok: false; error: 'no_connected_accounts' }
  | { ok: false; error: 'accounts_not_found' }
  | { ok: false; error: 'node_not_found'; message: string }
  | { ok: false; error: 'delivery_failed'; postId: string };

export type CreatePostFromNodesRepos = {
  brands: { findBrand: (db: Db, input: { orgId: string; brandId: string }) => Promise<{ id: string } | null> };
  accounts: { listBrandAccounts: (db: Db, input: { orgId: string; brandId: string }) => Promise<{ id: string }[]> };
  promoteNodesToPost: (
    db: Db,
    repos: unknown,
    input: {
      orgId: string;
      brandId: string;
      nodeIds: string[];
      caption?: string;
      actorKind?: 'user' | 'agent' | 'system';
      actorId?: string | null;
    }
  ) => Promise<Post>;
  setPostStatus: (db: Db, input: { orgId: string; postId: string; status: PostStatus }) => Promise<void>;
  scheduleDelivery: (
    db: Db,
    publisher: SocialPublisher,
    input: { orgId: string; postId: string; accountIds: string[]; scheduledFor?: string }
  ) => Promise<{ deliveries: DeliveryOutcome[] }>;
};

export async function createPostFromNodes(
  db: Db,
  repos: CreatePostFromNodesRepos,
  input: {
    orgId: string;
    userId: string;
    brandId: string;
    nodeIds: string[];
    caption: string;
    accountIds: string[];
    mode: CreatePostMode;
  },
  publisher: SocialPublisher
): Promise<CreatePostResult> {
  const brand = await repos.brands.findBrand(db, { orgId: input.orgId, brandId: input.brandId });
  if (!brand) {
    return { ok: false, error: 'brand_not_found' };
  }

  if (input.mode.kind === 'schedule') {
    const accounts = await repos.accounts.listBrandAccounts(db, { orgId: input.orgId, brandId: input.brandId });
    if (!accounts.length) {
      return { ok: false, error: 'no_connected_accounts' };
    }

    const knownAccountIds = new Set(accounts.map((a) => a.id));
    if (!input.accountIds.every((id) => knownAccountIds.has(id))) {
      return { ok: false, error: 'accounts_not_found' };
    }
  }

  let post: Post;
  try {
    post = await repos.promoteNodesToPost(
      db,
      {},
      {
        orgId: input.orgId,
        brandId: input.brandId,
        nodeIds: input.nodeIds,
        caption: input.caption,
        actorKind: 'user',
        actorId: input.userId
      }
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('node_not_found')) {
      return { ok: false, error: 'node_not_found', message: e.message };
    }
    throw e;
  }

  if (input.mode.kind === 'draft') {
    return { ok: true, post };
  }

  const { deliveries } = await repos.scheduleDelivery(db, publisher, {
    orgId: input.orgId,
    postId: post.id,
    accountIds: input.accountIds,
    scheduledFor: input.mode.at
  });

  if (!deliveries.some((d) => d.ok)) {
    return { ok: false, error: 'delivery_failed', postId: post.id };
  }

  await repos.setPostStatus(db, { orgId: input.orgId, postId: post.id, status: 'ready' });

  return { ok: true, post };
}
