import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { request } from '../../lib/api.ts';
import { withAuth } from '../util.ts';

/**
 * CAMPAGNE PUBBLICITARIE. Una campagna spende soldi veri, quindi `create_ad_campaign` non produce
 * mai qualcosa di già pubblicabile: nasce `draft`, `approved_by: null`, ed è `repos/ads.ts` a
 * garantirlo — non un controllo qui che si potrebbe dimenticare. `approve_ad_campaign` è l'unica
 * strada che la fa avanzare, e SOLO una sessione di una persona può chiamarla: una chiave API
 * (cioè questo stesso agente, su un turno diverso) viene rifiutata dal server.
 */
const org = z.string().optional().describe('Which org, if you belong to more than one.');

function call<T>(
  token: string,
  method: string,
  path: string,
  org: string | undefined,
  body?: unknown,
  extraQuery?: Record<string, string>
): Promise<T> {
  const qs = new URLSearchParams(extraQuery);
  if (org) qs.set('org', org);
  const suffix = qs.toString() ? `?${qs}` : '';
  return request<T>(`${path}${suffix}`, token, { method, body: body ? JSON.stringify(body) : undefined });
}

export function registerAdsTools(server: McpServer) {
  server.registerTool(
    'list_ad_campaigns',
    {
      title: 'List ad campaigns',
      description: 'Ad campaigns of one brand, with their status and whether a human has approved them yet. Free.',
      inputSchema: z.object({
        org,
        brand_id: z.string(),
        status: z
          .enum(['draft', 'pending_review', 'scheduled', 'active', 'paused', 'completed', 'failed', 'rejected'])
          .optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ org, brand_id, status }) =>
      withAuth((token) => call(token, 'GET', '/api/v1/org/ads/campaigns', org, undefined, { brand_id, ...(status ? { status } : {}) }))
  );

  server.registerTool(
    'create_ad_campaign',
    {
      title: 'Draft an ad campaign',
      description:
        'Draft a new ad campaign for a brand\'s ad account. It ALWAYS lands unapproved (`draft`, no ' +
        '`approved_by`) — a campaign spends real money, and nothing here can make it spend without a ' +
        'human approving it separately. Nothing is scheduled or billed by calling this. Free.',
      inputSchema: z.object({
        org,
        brand_id: z.string(),
        ad_account_id: z.string(),
        name: z.string().min(1),
        objective: z.enum([
          'awareness',
          'traffic',
          'engagement',
          'video_views',
          'lead_generation',
          'conversions',
          'app_promotion',
          'catalog_sales'
        ]),
        budget_type: z.enum(['daily', 'lifetime']),
        budget_amount: z.number().positive(),
        starts_at: z.string().optional(),
        ends_at: z.string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, ...input }) => withAuth((token) => call(token, 'POST', '/api/v1/org/ads/campaigns', org, input))
  );

  server.registerTool(
    'approve_ad_campaign',
    {
      title: 'Approve an ad campaign',
      description:
        'Let a drafted campaign spend. REFUSED over an API key on purpose: an agent cannot approve ' +
        'its own spend — this only works from a signed-in person\'s own session (the app, or `feega ' +
        'login`). If you are an agent and this fails, tell the person to approve it themselves.',
      inputSchema: z.object({ org, id: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ org, id }) => withAuth((token) => call(token, 'POST', `/api/v1/org/ads/campaigns/${encodeURIComponent(id)}/approve`, org))
  );
}
