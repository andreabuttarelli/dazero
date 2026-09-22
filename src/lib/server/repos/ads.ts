import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';
import type { Actor } from './actor';

/**
 * GLI ANNUNCI: ACCOUNT, CAMPAGNE, CREATIVITÀ — DEL BRAND, NON DEL PROGETTO.
 *
 * Come `posts.ts`: un annuncio pubblicitario esiste per un brand (voce, palette, account
 * pubblicitario collegato), non per una tela. `ad_campaigns.approved_by` è nullable per un motivo
 * preciso — una campagna spende soldi veri, e questa colonna è il cancello: un agente la crea, un
 * umano la approva. `createCampaign` non lo valorizza mai; solo `approveCampaign` lo fa.
 */
type CampaignRow = Database['public']['Tables']['ad_campaigns']['Row'];
type AccountRow = Database['public']['Tables']['ad_accounts']['Row'];

export const CAMPAIGN_STATUSES = [
  'draft',
  'pending_review',
  'scheduled',
  'active',
  'paused',
  'completed',
  'failed',
  'rejected'
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export type AdAccount = {
  id: string;
  brandId: string;
  platform: string;
  name: string | null;
  currency: string;
  status: string;
};

export type AdCampaign = {
  id: string;
  brandId: string;
  adAccountId: string;
  name: string;
  objective: string;
  budgetType: string;
  budgetAmount: number;
  status: CampaignStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

const ACCOUNT_COLUMNS = 'id, brand_id, platform, name, currency, status';
const CAMPAIGN_COLUMNS =
  'id, brand_id, ad_account_id, name, objective, budget_type, budget_amount, status, approved_by, approved_at, starts_at, ends_at';

type AccountColumns = Pick<AccountRow, 'id' | 'brand_id' | 'platform' | 'name' | 'currency' | 'status'>;
type CampaignColumns = Pick<
  CampaignRow,
  | 'id'
  | 'brand_id'
  | 'ad_account_id'
  | 'name'
  | 'objective'
  | 'budget_type'
  | 'budget_amount'
  | 'status'
  | 'approved_by'
  | 'approved_at'
  | 'starts_at'
  | 'ends_at'
>;

function toAccount(row: AccountColumns): AdAccount {
  return { id: row.id, brandId: row.brand_id, platform: row.platform, name: row.name, currency: row.currency, status: row.status };
}

function toCampaign(row: CampaignColumns): AdCampaign {
  return {
    id: row.id,
    brandId: row.brand_id,
    adAccountId: row.ad_account_id,
    name: row.name,
    objective: row.objective,
    budgetType: row.budget_type,
    budgetAmount: Number(row.budget_amount),
    status: row.status as CampaignStatus,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    startsAt: row.starts_at,
    endsAt: row.ends_at
  };
}

export async function listAdAccounts(db: Db, scope: { orgId: string; brandId: string }): Promise<AdAccount[]> {
  const { data, error } = await db
    .from('ad_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('brand_id', scope.brandId);

  if (error) throw error;
  return (data ?? []).map(toAccount);
}

export async function listCampaigns(
  db: Db,
  scope: { orgId: string; brandId: string; status?: CampaignStatus }
): Promise<AdCampaign[]> {
  let query = db.from('ad_campaigns').select(CAMPAIGN_COLUMNS).eq('org_id', scope.orgId).eq('brand_id', scope.brandId);
  if (scope.status) query = query.eq('status', scope.status);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toCampaign);
}

export async function findCampaign(db: Db, input: { orgId: string; campaignId: string }): Promise<AdCampaign | null> {
  const { data, error } = await db
    .from('ad_campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.campaignId)
    .maybeSingle();

  if (error) throw error;
  return data ? toCampaign(data) : null;
}

/**
 * SEMPRE `status: 'draft'`, SEMPRE `approved_by: null`. Una campagna nata da un agente non è mai
 * pubblicabile da sola — vedi `approveCampaign`, l'unica strada che la fa avanzare.
 */
export async function createCampaign(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    adAccountId: string;
    name: string;
    objective: string;
    budgetType: string;
    budgetAmount: number;
    startsAt?: string | null;
    endsAt?: string | null;
    targeting?: Record<string, unknown> | null;
    actor: Actor;
  }
): Promise<AdCampaign> {
  const { data, error } = await db
    .from('ad_campaigns')
    .insert({
      org_id: input.orgId,
      brand_id: input.brandId,
      ad_account_id: input.adAccountId,
      name: input.name,
      objective: input.objective,
      budget_type: input.budgetType,
      budget_amount: input.budgetAmount,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      targeting: (input.targeting ?? null) as Database['public']['Tables']['ad_campaigns']['Insert']['targeting'],
      status: 'draft',
      actor_kind: input.actor.kind,
      actor_id: input.actor.id,
      agent_key: input.actor.agentKey ?? null
    })
    .select(CAMPAIGN_COLUMNS)
    .single();

  if (error) throw error;
  return toCampaign(data);
}

/**
 * L'UNICA STRADA CHE VALORIZZA `approved_by`. Chi approva è sempre una persona: un agente non può
 * chiamarla per conto proprio — la userà chi ha un profilo, cioè `actorId` di un attore `user`.
 */
export async function approveCampaign(
  db: Db,
  input: { orgId: string; campaignId: string; approvedBy: string }
): Promise<AdCampaign | null> {
  const { data, error } = await db
    .from('ad_campaigns')
    .update({
      approved_by: input.approvedBy,
      approved_at: new Date().toISOString(),
      status: 'scheduled',
      updated_at: new Date().toISOString()
    })
    .eq('id', input.campaignId)
    .eq('org_id', input.orgId)
    .in('status', ['draft', 'pending_review'])
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? toCampaign(data) : null;
}

export async function setCampaignStatus(
  db: Db,
  input: { orgId: string; campaignId: string; status: CampaignStatus }
): Promise<void> {
  const { error } = await db
    .from('ad_campaigns')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.campaignId)
    .eq('org_id', input.orgId);

  if (error) throw error;
}
