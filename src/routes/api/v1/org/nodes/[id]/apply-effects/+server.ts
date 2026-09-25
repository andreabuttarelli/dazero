import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { applyEffectsNode } from '$lib/server/canvas/apply-effects';

/**
 * LA STESSA RESA CHE `EffectsEditor.svelte` FA NEL BROWSER, per un agente MCP senza browser.
 * Nessun gate crediti: `applyEffectsNode` non chiama un provider, gira in locale su `sharp`.
 */
export const POST: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, userId, writeAllowed } = resolved.caller;
  if (!writeAllowed) return json({ error: 'api_key_read_only' }, { status: 403 });

  const nodeId = params.id ?? '';
  const outcome = await applyEffectsNode(db, { orgId, nodeId, actor: { kind: 'user', id: userId } });

  if (outcome.outcome === 'refused') return json({ error: outcome.error }, { status: 400 });
  if (outcome.outcome === 'conflict') return json({ conflict: true }, { status: 409 });
  return json({ asset: outcome.asset });
};
