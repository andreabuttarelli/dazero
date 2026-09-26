import type { Db } from '$lib/server/db/client';
import type { SocialPublisher } from '$lib/server/publishing/port';
import { formatFor, type Platform } from '$lib/platform-capabilities';

/**
 * ZERNIO È L'UNICA FONTE DI VERITÀ PER PROGRAMMAZIONE E PUBBLICAZIONE (decisione utente,
 * 2026-09-22). Questo file non tiene NESSUNO stato di consegna: non scrive uno `status`, non
 * scrive un `scheduled_at`, non scrive un `error` — ogni domanda "è uscito? quando? con che
 * errore?" la fa a Zernio, ogni volta, con l'id che questo file tiene.
 *
 * Quello che scrive è UN PUNTATORE, `posts.zernio_post_ids`: `{ "<social_accounts.id>":
 * "<zernio post id>" }`. La chiave è l'account, non la piattaforma — un brand con due account
 * sulla stessa piattaforma altrimenti collidono sulla stessa chiave — e Zernio pubblica un post
 * per (account, piattaforma) alla volta (`SocialPublisher.publish`, un `accountId` solo, un
 * `postId` di ritorno): un post feega mandato a tre account fa tre chiamate e porta tre id.
 */

type ZernioPostIds = Record<string, string>;

type PostForDelivery = {
  id: string;
  brandId: string;
  caption: string;
  perPlatform: Record<string, { caption?: string }> | null;
  media: { assetId: string; order: number; role?: string }[];
  zernioPostIds: ZernioPostIds;
};

async function findPostForDelivery(db: Db, input: { orgId: string; postId: string }): Promise<PostForDelivery | null> {
  const { data, error } = await db
    .from('posts')
    .select('id, brand_id, caption, per_platform, media, zernio_post_ids')
    .eq('org_id', input.orgId)
    .eq('id', input.postId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    brand_id: string;
    caption: string;
    per_platform: Record<string, { caption?: string }> | null;
    media: { assetId: string; order: number; role?: string }[] | null;
    zernio_post_ids: ZernioPostIds | null;
  };

  return {
    id: row.id,
    brandId: row.brand_id,
    caption: row.caption,
    perPlatform: row.per_platform,
    media: row.media ?? [],
    zernioPostIds: row.zernio_post_ids ?? {}
  };
}

/**
 * `zernio_post_ids` non è ancora nei tipi generati: la migration che lo aggiunge
 * (`supabase/canvas-migrations/20260922_drop_scheduled_posts.sql`) è scritta ma non applicata —
 * va applicata da chi la revisiona, poi `npm run db:types` la porta dentro
 * `database.types.ts`/`NarrowedPosts` e questo cast sparisce da solo.
 */
type PostsUpdateWithZernioPointer = { zernio_post_ids: ZernioPostIds; updated_at: string };

async function writeZernioPostIds(db: Db, input: { orgId: string; postId: string; zernioPostIds: ZernioPostIds }): Promise<void> {
  const patch: PostsUpdateWithZernioPointer = {
    zernio_post_ids: input.zernioPostIds,
    updated_at: new Date().toISOString()
  };
  const { error } = await db
    .from('posts')
    .update(patch as never)
    .eq('org_id', input.orgId)
    .eq('id', input.postId);

  if (error) throw error;
}

type DeliveryAccount = { id: string; platform: Platform; zernioAccountId: string };

async function findAccounts(
  db: Db,
  input: { orgId: string; brandId: string; accountIds: string[] }
): Promise<DeliveryAccount[]> {
  if (!input.accountIds.length) return [];

  const { data, error } = await db
    .from('social_accounts')
    .select('id, platform, zernio_account_id')
    .eq('org_id', input.orgId)
    .eq('brand_id', input.brandId)
    .in('id', input.accountIds);

  if (error) throw error;

  return ((data ?? []) as unknown as { id: string; platform: string; zernio_account_id: string }[]).map((row) => ({
    id: row.id,
    platform: row.platform as Platform,
    zernioAccountId: row.zernio_account_id
  }));
}

type AssetForMedia = { id: string; type: string; url: string | null };

async function resolveMediaAssets(
  db: Db,
  input: { orgId: string; media: { assetId: string; order: number }[] }
): Promise<AssetForMedia[]> {
  if (!input.media.length) return [];

  const ids = input.media.map((m) => m.assetId);
  const { data, error } = await db.from('assets').select('id, type, url').eq('org_id', input.orgId).in('id', ids);
  if (error) throw error;

  const byId = new Map(((data ?? []) as unknown as AssetForMedia[]).map((a) => [a.id, a]));
  return input.media
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((m) => byId.get(m.assetId))
    .filter((a): a is AssetForMedia => a !== undefined);
}

function captionFor(post: PostForDelivery, platform: Platform): string {
  return post.perPlatform?.[platform]?.caption ?? post.caption;
}

export type DeliveryOutcome =
  | { accountId: string; ok: true; zernioPostId: string }
  | { accountId: string; ok: false; error: string };

/**
 * Una consegna per account: `formatFor` decide se il media di QUESTO account (stessa lista per
 * tutti, la piattaforma cambia cosa ne fa) sta sulla sua piattaforma — se no si rifiuta quella
 * consegna sola, senza troncare né toccare le altre. Un fallimento Zernio su un account (rete,
 * rate limit, 500) non impedisce le consegne successive: ognuna è indipendente e il chiamante
 * vede quale è andata e quale no.
 */
export async function scheduleDelivery(
  db: Db,
  publisher: SocialPublisher,
  input: { orgId: string; postId: string; accountIds: string[]; scheduledFor?: string }
): Promise<{ deliveries: DeliveryOutcome[] }> {
  const post = await findPostForDelivery(db, { orgId: input.orgId, postId: input.postId });
  if (!post) throw new Error(`post_not_found: ${input.postId}`);

  const accounts = await findAccounts(db, { orgId: input.orgId, brandId: post.brandId, accountIds: input.accountIds });
  const assets = await resolveMediaAssets(db, { orgId: input.orgId, media: post.media });
  const mediaKinds = assets.map((a) => ({ kind: a.type as 'image' | 'video' }));
  const mediaUrls = assets.map((a) => a.url).filter((u): u is string => Boolean(u));

  const deliveries: DeliveryOutcome[] = [];
  const zernioPostIds: ZernioPostIds = { ...post.zernioPostIds };

  for (const account of accounts) {
    const format = formatFor(account.platform, mediaKinds);
    if (!format.ok) {
      deliveries.push({ accountId: account.id, ok: false, error: format.reason });
      continue;
    }

    try {
      const receipt = await publisher.publish({
        accountId: account.zernioAccountId,
        platform: account.platform,
        content: captionFor(post, account.platform),
        mediaUrls: mediaUrls.length ? mediaUrls : undefined,
        scheduledFor: input.scheduledFor
      });

      if (!receipt.ok || !receipt.postId) {
        deliveries.push({ accountId: account.id, ok: false, error: 'no_provider' });
        continue;
      }

      zernioPostIds[account.id] = receipt.postId;
      deliveries.push({ accountId: account.id, ok: true, zernioPostId: receipt.postId });
    } catch (e) {
      deliveries.push({ accountId: account.id, ok: false, error: e instanceof Error ? e.message : 'publish_failed' });
    }
  }

  const requestedAccountIds = new Set(input.accountIds);
  const foundAccountIds = new Set(accounts.map((a) => a.id));
  for (const id of requestedAccountIds) {
    if (!foundAccountIds.has(id)) deliveries.push({ accountId: id, ok: false, error: 'account_not_found' });
  }

  if (deliveries.some((d) => d.ok)) {
    await writeZernioPostIds(db, { orgId: input.orgId, postId: input.postId, zernioPostIds });
  }

  return { deliveries };
}

export type AccountDeliveryStatus = {
  accountId: string;
  platform: Platform;
  status: string;
  url: string | null;
  error: string | null;
};

/**
 * Legge SEMPRE da Zernio: nessuna colonna nostra dice "scheduled"/"published"/"failed". Un
 * account senza voce nel puntatore non è mai stato consegnato — nessuna chiamata per lui.
 */
export async function deliveryStatus(
  db: Db,
  publisher: SocialPublisher,
  input: { orgId: string; postId: string }
): Promise<AccountDeliveryStatus[]> {
  const post = await findPostForDelivery(db, { orgId: input.orgId, postId: input.postId });
  if (!post) throw new Error(`post_not_found: ${input.postId}`);

  const accountIds = Object.keys(post.zernioPostIds);
  if (!accountIds.length) return [];

  const accounts = await findAccounts(db, { orgId: input.orgId, brandId: post.brandId, accountIds });
  const platformOf = new Map(accounts.map((a) => [a.id, a.platform]));

  const results: AccountDeliveryStatus[] = [];
  for (const accountId of accountIds) {
    const zernioPostId = post.zernioPostIds[accountId];
    const platform = platformOf.get(accountId) ?? ('' as Platform);
    try {
      const remote = await publisher.postStatus(zernioPostId);
      results.push({ accountId, platform, status: remote.status, url: remote.url, error: remote.error });
    } catch (e) {
      results.push({
        accountId,
        platform,
        status: 'unreachable',
        url: null,
        error: e instanceof Error ? e.message : 'zernio_unreachable'
      });
    }
  }
  return results;
}

/**
 * Cancella su Zernio PRIMA di togliere il puntatore — se la cancellazione fallisce, il puntatore
 * resta: senza, una `deletePost` fallita lascerebbe la programmazione viva su Zernio e nessuna
 * riga da nessuna parte che lo racconta (lo stesso incidente che post-editing.ts commentava per
 * il vecchio schema).
 */
export async function cancelDelivery(
  db: Db,
  publisher: SocialPublisher,
  input: { orgId: string; postId: string; accountId: string }
): Promise<void> {
  const post = await findPostForDelivery(db, { orgId: input.orgId, postId: input.postId });
  if (!post) throw new Error(`post_not_found: ${input.postId}`);

  const zernioPostId = post.zernioPostIds[input.accountId];
  if (!zernioPostId) return;

  await publisher.deletePost(zernioPostId);

  const zernioPostIds = { ...post.zernioPostIds };
  delete zernioPostIds[input.accountId];
  await writeZernioPostIds(db, { orgId: input.orgId, postId: input.postId, zernioPostIds });
}
