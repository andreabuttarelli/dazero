import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { describeNodeType, describeNodeTypes, isNodeType } from '$lib/canvas/node-data';

/**
 * LA FORMA DI `nodes.data`, PER CHI SCRIVE `insert_row`/`update_row` SENZA VEDERE IL CODICE.
 *
 * Non una seconda descrizione scritta a mano: `describeNodeType`/`describeNodeTypes` derivano il
 * JSON Schema dagli STESSI schemi Zod che `write-tool.ts` applica — questa rotta li mette solo
 * dietro HTTP, come `/org/query`. Un `type` nella querystring risponde per un tipo solo, senza
 * pagare gli altri otto quando il chiamante ne conosce già uno.
 */
export const GET: RequestHandler = async ({ request, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const type = url.searchParams.get('type');
  if (type) {
    if (!isNodeType(type)) {
      return json({ error: 'unknown_type', message: `"${type}" is not a nodes.type value.` }, { status: 400 });
    }
    return json({ types: { [type]: describeNodeType(type) } });
  }

  return json({ types: describeNodeTypes() });
};
