import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { approveCampaign } from '$lib/server/repos/ads';

/**
 * IL CANCELLO UMANO. `ad_campaigns.approved_by` esiste per una ragione sola: una campagna creata da
 * un agente non deve poter spendere senza che una persona l'abbia guardata. Una chiave API — cioè
 * un agente esterno via MCP — non passa mai di qui: `apiKeyId` presente è un agente che agisce per
 * conto di qualcuno, e "per conto di" non è "è" quel qualcuno. Solo una sessione utente (Bearer
 * JWT di una persona loggata) può approvare.
 */
export const POST: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, userId, apiKeyId } = resolved.caller;
  if (apiKeyId) {
    return json(
      { error: 'human_approval_required', message: 'A campaign cannot approve itself over an API key — sign in as a person to approve it.' },
      { status: 403 }
    );
  }

  const campaign = await approveCampaign(db, { orgId, campaignId: params.id ?? '', approvedBy: userId });
  if (!campaign) {
    return json({ error: 'campaign_not_approvable', message: 'Not found, or already past draft/pending_review.' }, { status: 404 });
  }

  return json({ campaign });
};
