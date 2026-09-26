import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { listCampaigns, createCampaign, type CampaignStatus } from '$lib/server/repos/ads';
import { agentActor } from '$lib/server/repos/actor';

/**
 * UNA CAMPAGNA SPENDE SOLDI VERI. Un agente la crea sempre `status: 'draft'`, `approved_by: null` —
 * `repos/ads.ts` non lascia altra strada. Non c'è un modo di chiamare questa rotta e ottenere una
 * campagna già approvata: quello è `approve/+server.ts`, e chiede un umano.
 */
export const GET: RequestHandler = async ({ request, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const brandId = url.searchParams.get('brand_id');
  if (!brandId) return json({ error: 'brand_id_required' }, { status: 400 });

  const { db, orgId } = resolved.caller;
  const status = url.searchParams.get('status') as CampaignStatus | null;
  const campaigns = await listCampaigns(db, { orgId, brandId, status: status ?? undefined });

  return json({ campaigns });
};

export const POST: RequestHandler = async ({ request, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, userId, apiKeyId, writeAllowed } = resolved.caller;
  if (!writeAllowed) return json({ error: 'api_key_read_only' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    brand_id?: string;
    ad_account_id?: string;
    name?: string;
    objective?: string;
    budget_type?: string;
    budget_amount?: number;
    starts_at?: string;
    ends_at?: string;
  };

  if (!body.brand_id || !body.ad_account_id || !body.name || !body.objective || !body.budget_type || !body.budget_amount) {
    return json(
      { error: 'missing_fields', required: ['brand_id', 'ad_account_id', 'name', 'objective', 'budget_type', 'budget_amount'] },
      { status: 400 }
    );
  }

  const actor = agentActor(userId, apiKeyId ? `api_key:${apiKeyId}` : 'sidebar');
  const campaign = await createCampaign(db, {
    orgId,
    brandId: body.brand_id,
    adAccountId: body.ad_account_id,
    name: body.name,
    objective: body.objective,
    budgetType: body.budget_type,
    budgetAmount: body.budget_amount,
    startsAt: body.starts_at ?? null,
    endsAt: body.ends_at ?? null,
    actor
  });

  return json({
    campaign,
    note: 'Created as draft, unapproved. A human must approve it before it can spend — see POST .../approve.'
  });
};
