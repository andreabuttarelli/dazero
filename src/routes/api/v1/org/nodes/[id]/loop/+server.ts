import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { gateOrgAiAction } from '$lib/server/cli-auth';
import { findNode } from '$lib/server/repos/canvas';
import { planLoop, runLoop } from '$lib/server/canvas/loop';

/**
 * IL LOOP DI UN NODO DI GENERAZIONE, per la tela e per un agente MCP allo stesso modo.
 *
 * GET  → il preventivo (`planLoop`): quante combinazioni, quanti crediti, MAI un gate crediti —
 *        un preventivo non spende, e farlo pagare il diritto di guardarlo sarebbe un secondo
 *        significato per lo stesso verbo.
 * POST → esegue (`runLoop`), con lo stesso gate crediti di `generate/+server.ts`: sopra 50
 *        combinazioni senza `confirm: true` torna `needs_confirmation` (200, non un errore — è
 *        una domanda, non un rifiuto), sopra 1000 `refused` (400) qualunque cosa `confirm` dica.
 */
export const GET: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId } = resolved.caller;
  const nodeId = params.id ?? '';

  const node = await findNode(db, { orgId, nodeId });
  if (!node) return json({ error: 'node_not_found' }, { status: 404 });

  const plan = await planLoop(db, { orgId, canvasId: node.canvasId, nodeId });
  return json(plan);
};

export const POST: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, userId, apiKeyId, writeAllowed } = resolved.caller;
  if (!writeAllowed) return json({ error: 'api_key_read_only' }, { status: 403 });

  const nodeId = params.id ?? '';

  const node = await findNode(db, { orgId, nodeId });
  if (!node) return json({ error: 'node_not_found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };

  const gate = await gateOrgAiAction(orgId, apiKeyId ? { id: apiKeyId, name: '', user_id: userId, org_id: orgId, scopes: ['write'] } : undefined);
  if (gate) return gate;

  const outcome = await runLoop(db, {
    orgId,
    projectId: node.projectId,
    canvasId: node.canvasId,
    nodeId,
    userId,
    confirmed: body.confirm === true
  });

  if (outcome.kind === 'refused') return json({ error: outcome.error }, { status: 400 });
  return json(outcome);
};
