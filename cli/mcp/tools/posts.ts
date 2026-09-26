import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { request } from '../../lib/api.ts';
import { withAuth } from '../util.ts';

/**
 * IL POST (tabella `posts`), NON IL NODO. Un post è l'artefatto PROMOSSO — caption, media, brand —
 * pronto per essere schedulato o diventare una creatività pubblicitaria. Un nodo è materiale
 * grezzo sulla tela: `query`/`insert_row`/`update_row` lo raggiungono già, perché scrivere un nodo
 * non è un'azione sul mondo, è disegnare. Promuovere un post lo è — nasce un contenuto pronto a
 * uscire — ed è per questo che ha un tool suo, distinto per nome da qualunque cosa parli di nodi.
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

export function registerPostTools(server: McpServer) {
  server.registerTool(
    'list_posts',
    {
      title: 'List posts',
      description:
        'Posts of one brand — the promoted artifacts, not canvas nodes. Filter by status ' +
        '(draft, ready, archived). Free.',
      inputSchema: z.object({ org, brand_id: z.string(), status: z.enum(['draft', 'ready', 'archived']).optional() }),
      annotations: { readOnlyHint: true }
    },
    async ({ org, brand_id, status }) =>
      withAuth((token) => call(token, 'GET', '/api/v1/org/posts', org, undefined, { brand_id, ...(status ? { status } : {}) }))
  );

  server.registerTool(
    'create_post',
    {
      title: 'Promote to a post',
      description:
        'Turn material into a post: this is what makes something publishable, distinct from ' +
        'writing to a node. Two ways in: give it a brand, a caption and its media (asset ids ' +
        'already in this org) directly — or give it `node_ids` and let it resolve each node to its ' +
        'asset itself (uploaded or generated), ordered by canvas reading order (top-to-bottom, ' +
        'left-to-right), with text/doc nodes becoming the caption. `sources` optionally links back ' +
        'to the nodes it came from when using the direct form. Lands as `draft`; nothing is ' +
        'scheduled or published from here. Free.',
      inputSchema: z.object({
        org,
        brand_id: z.string(),
        caption: z.string().min(1).optional(),
        media: z.array(z.object({ assetId: z.string(), order: z.number().int(), role: z.string().optional() })).optional(),
        title: z.string().optional(),
        link_url: z.string().optional(),
        sources: z.array(z.object({ node_id: z.string(), role: z.enum(['caption', 'media', 'reference']).optional() })).optional(),
        node_ids: z.array(z.string()).optional().describe('Resolve these canvas nodes into the post instead of passing caption/media directly.')
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, ...input }) => withAuth((token) => call(token, 'POST', '/api/v1/org/posts', org, input))
  );

  server.registerTool(
    'set_post_status',
    {
      title: 'Change a post status',
      description: 'Move a post between draft, ready and archived. Does not schedule or publish it. Free.',
      inputSchema: z.object({ org, id: z.string(), status: z.enum(['draft', 'ready', 'archived']) }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, id, status }) => withAuth((token) => call(token, 'PATCH', `/api/v1/org/posts/${encodeURIComponent(id)}`, org, { status }))
  );
}
