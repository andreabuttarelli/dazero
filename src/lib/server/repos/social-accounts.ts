import type { Db } from '$lib/server/db/client';
import type { Platform } from '$lib/platform-capabilities';

export type SocialAccount = {
  id: string;
  platform: Platform;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
};

const ACCOUNT_COLUMNS = 'id, platform, handle, display_name, avatar_url, status';

type AccountColumns = {
  id: string;
  platform: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
};

function toAccount(row: AccountColumns): SocialAccount {
  return {
    id: row.id,
    platform: row.platform as Platform,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status
  };
}

/** Le uniche colonne vere di `social_accounts` (vedi ground truth in NEW_DATABASE_STRUCTURE.md):
 *  niente token, mai — Zernio li tiene, qui c'è solo l'identificativo (CLAUDE.md). */
export async function listBrandAccounts(db: Db, input: { orgId: string; brandId: string }): Promise<SocialAccount[]> {
  const { data, error } = await db
    .from('social_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('brand_id', input.brandId)
    .order('platform');

  if (error) throw error;
  return ((data ?? []) as unknown as AccountColumns[]).map(toAccount);
}
