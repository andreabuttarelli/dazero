import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { createOrgWriteTools } from '$lib/server/org-data/write-tool';
import { agentActor } from '$lib/server/repos/actor';
import { INSERT_ROW, UPDATE_ROW, DELETE_ROW } from '@feega/api-contracts';

/**
 * `insert_row`/`update_row`/`delete_row` sul nuovo schema. Come `/org/query`, monta lo stesso
 * codice del tool MCP: cancello, tetto sulle righe e traduzione degli errori non possono divergere.
 *
 * Una chiave API senza lo scope `write` è rifiutata QUI, una volta, prima di aprire il tool — non
 * dentro ogni operazione: `writeAllowed` viene dagli `scopes` della riga in `api_keys`.
 */
const write = async (request: Request, url: URL, op: 'insert' | 'update' | 'delete') => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { authority, orgId, userId, apiKeyId, writeAllowed } = resolved.caller;
  if (!writeAllowed) {
    return json({ error: 'api_key_read_only' }, { status: 403 });
  }

  const actor = apiKeyId ? agentActor(userId, `api_key:${apiKeyId}`) : undefined;
  const tools = createOrgWriteTools({ authority, orgId, userId, actor });
  const contract = op === 'insert' ? INSERT_ROW : op === 'update' ? UPDATE_ROW : DELETE_ROW;
  const parsed = contract.input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: 'invalid_input', details: parsed.error.issues }, { status: 400 });
  }

  if (op === 'insert') return json(await tools.insertRow(parsed.data as Parameters<typeof tools.insertRow>[0]));
  if (op === 'update') return json(await tools.updateRow(parsed.data as Parameters<typeof tools.updateRow>[0]));
  return json(await tools.deleteRow(parsed.data as Parameters<typeof tools.deleteRow>[0]));
};

export const POST: RequestHandler = ({ request, url }) => write(request, url, 'insert');

export const PUT: RequestHandler = ({ request, url }) => write(request, url, 'update');

export const DELETE: RequestHandler = ({ request, url }) => write(request, url, 'delete');
