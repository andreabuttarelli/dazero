import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { gateOrgAiAction } from '$lib/server/cli-auth';
import { findNode } from '$lib/server/repos/canvas';
import { runGenNode } from '$lib/server/canvas/generate';

/**
 * LA STESSA PORTA DEL BOTTONE «GENERA» SULLA TELA, per un agente MCP. Il motore è `runGenNode`,
 * lo stesso di `run` in `+page.server.ts`: nessuna copia, nessuna seconda verità su come un nodo
 * genera contenuto. `medium` deve corrispondere al `type` del nodo — un agente che chiede
 * un'immagine su un nodo video prenderebbe un giro sprecato senza questo rifiuto anticipato.
 */
export const POST: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, userId, apiKeyId, writeAllowed } = resolved.caller;
  if (!writeAllowed) return json({ error: 'api_key_read_only' }, { status: 403 });

  const nodeId = params.id ?? '';
  const node = await findNode(db, { orgId, nodeId });
  if (!node) return json({ error: 'node_not_found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    medium?: string;
    prompt?: string;
    model?: string;
    version?: number;
    params?: Record<string, unknown>;
  };

  if (body.medium !== node.type) {
    return json({ error: 'medium_mismatch' }, { status: 400 });
  }

  const gate = await gateOrgAiAction(orgId, apiKeyId ? { id: apiKeyId, name: '', user_id: userId, org_id: orgId, scopes: ['write'] } : undefined);
  if (gate) return gate;

  const outcome = await runGenNode(db, {
    orgId,
    projectId: node.projectId,
    canvasId: node.canvasId,
    nodeId: node.id,
    userId,
    medium: body.medium as never,
    prompt: body.prompt ?? '',
    model: body.model ?? null,
    params: (body.params ?? {}) as never,
    expectedVersion: body.version ?? node.version
  });

  if (outcome.kind === 'refused') return json({ error: outcome.error }, { status: 400 });
  if (outcome.kind === 'conflict') return json({ conflict: true }, { status: 409 });
  return json(outcome);
};
