import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';
import type { PostMedia } from '$lib/server/repos/posts';

/**
 * LA CONSEGNA: QUESTO POST, SU QUESTO ACCOUNT, A QUEST'ORA.
 *
 * Una riga per account, non una per post. Lo stesso post su cinque account sono cinque consegne:
 * quattro possono riuscire e una fallire, e con una riga sola non sapresti quale.
 *
 * ⚠️ Qui NON c'è il claim del worker. Il lock atomico che impedisce a due cron sovrapposti di
 * pubblicare due volte lo stesso post appartiene alla fase che scrive il worker, e va scritto
 * insieme al suo test: metterlo qui senza chi lo esercita darebbe una riga che sembra una difesa
 * e non ne è ancora una.
 */
type ScheduledRow = Database['public']['Tables']['scheduled_posts']['Row'];
type AccountRow = Database['public']['Tables']['social_accounts']['Row'];

export const DELIVERY_STATUSES = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'canceled'
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ACCOUNT_STATUSES = ['connected', 'expired', 'revoked'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type SocialAccount = {
  id: string;
  brandId: string;
  platform: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: AccountStatus;
  zernioAccountId: string;
};

export type Delivery = {
  id: string;
  postId: string;
  accountId: string;
  platform: string;
  caption: string | null;
  media: PostMedia[] | null;
  scheduledAt: string | null;
  timezone: string;
  status: DeliveryStatus;
  attempts: number;
  error: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
};

const ACCOUNT_COLUMNS =
  'id, brand_id, platform, handle, display_name, avatar_url, status, zernio_account_id';
const DELIVERY_COLUMNS =
  'id, post_id, account_id, platform, caption, media, scheduled_at, timezone, status, attempts, error, published_at, external_url';

type AccountColumns = Pick<
  AccountRow,
  'id' | 'brand_id' | 'platform' | 'handle' | 'display_name' | 'avatar_url' | 'status' | 'zernio_account_id'
>;

type DeliveryColumns = Pick<
  ScheduledRow,
  | 'id'
  | 'post_id'
  | 'account_id'
  | 'platform'
  | 'caption'
  | 'media'
  | 'scheduled_at'
  | 'timezone'
  | 'status'
  | 'attempts'
  | 'error'
  | 'published_at'
  | 'external_url'
>;

function toAccount(row: AccountColumns): SocialAccount {
  return {
    id: row.id,
    brandId: row.brand_id,
    platform: row.platform,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status as AccountStatus,
    zernioAccountId: row.zernio_account_id
  };
}

function toDelivery(row: DeliveryColumns): Delivery {
  return {
    id: row.id,
    postId: row.post_id,
    accountId: row.account_id,
    platform: row.platform,
    caption: row.caption,
    media: (row.media as unknown as PostMedia[] | null) ?? null,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    status: row.status as DeliveryStatus,
    attempts: row.attempts,
    error: row.error,
    publishedAt: row.published_at,
    externalUrl: row.external_url
  };
}

export async function listAccounts(
  db: Db,
  scope: { orgId: string; brandId: string }
): Promise<SocialAccount[]> {
  const { data, error } = await db
    .from('social_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('brand_id', scope.brandId)
    .order('platform', { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toAccount);
}

export async function listDeliveries(
  db: Db,
  scope: { orgId: string; postId: string }
): Promise<Delivery[]> {
  const { data, error } = await db
    .from('scheduled_posts')
    .select(DELIVERY_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('post_id', scope.postId)
    .order('scheduled_at', { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toDelivery);
}

export async function scheduleDelivery(
  db: Db,
  input: {
    orgId: string;
    postId: string;
    accountId: string;
    platform: string;
    scheduledAt: string;
    timezone?: string;
    caption?: string | null;
    media?: PostMedia[] | null;
  }
): Promise<Delivery> {
  const { data, error } = await db
    .from('scheduled_posts')
    .insert({
      org_id: input.orgId,
      post_id: input.postId,
      account_id: input.accountId,
      platform: input.platform,
      scheduled_at: input.scheduledAt,
      timezone: input.timezone ?? 'UTC',
      caption: input.caption ?? null,
      media: input.media ?? null,
      status: 'scheduled'
    })
    .select(DELIVERY_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toDelivery(data);
}

export async function cancelDelivery(
  db: Db,
  input: { orgId: string; deliveryId: string }
): Promise<void> {
  const { error } = await db
    .from('scheduled_posts')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', input.deliveryId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}
