import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { request } from '../../lib/api.ts';
import { withAuth } from '../util.ts';

/**
 * `query` / `insert_row` / `update_row` / `delete_row` — SCOPO ORG, NON BRAND.
 *
 * Il vecchio registro (`brand-content.ts`) parlava sempre di UN brand identificato da uno slug.
 * Qui non c'è slug: un'org può avere progetti senza brand, tele senza brand, post che invece un
 * brand ce l'hanno sempre — e questi quattro tool leggono e scrivono ovunque dentro l'org di chi
 * chiama, mai un brand che sta al posto di progetto/tela/brand. Il server (`/api/v1/org/query`,
 * `/api/v1/org/rows`) impone `org_id` per costruzione: un id di un'altra org non torna mai niente,
 * né un errore che lo distingua da un id inventato.
 *
 * `org` è opzionale: un utente con più org ne sceglie una nella query string; una chiave API la
 * ignora — la sua org è quella della chiave, sempre.
 */
const org = z.string().optional().describe('Which org, if you belong to more than one. Omit to use the default.');

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
  return request<T>(`${path}${suffix}`, token, {
    method,
    body: body ? JSON.stringify(body) : undefined
  });
}

export function registerOrgDataTools(server: McpServer) {
  server.registerTool(
    'query',
    {
      title: 'Query the database',
      description:
        'READ ANYTHING in your org: projects, canvases, nodes, connections, assets, posts, ads, ' +
        'products, social accounts — every table, scoped to your org and nothing else. No SQL: name ' +
        'a table, columns and filters, and it issues one PostgREST read. Omit `table` to list every ' +
        'name. A project has no brand until one is attached (`projects.brand_id` is nullable, and ' +
        'that is the normal case). A canvas belongs to a project; nodes and their connections belong ' +
        'to a canvas. A post (`posts` table) is the promoted artifact — caption, media, brand — ' +
        'different from a node, which is raw canvas material; `post_sources` links a post back to ' +
        'the nodes it came from. Free.',
      inputSchema: z.object({
        org,
        table: z.string().optional(),
        columns: z.array(z.string()).optional(),
        where: z
          .array(
            z.object({
              column: z.string(),
              op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'cd']),
              value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))]),
              negate: z.boolean().optional()
            })
          )
          .optional(),
        order: z
          .union([
            z.object({ column: z.string(), ascending: z.boolean().optional(), nullsFirst: z.boolean().optional() }),
            z.array(z.object({ column: z.string(), ascending: z.boolean().optional(), nullsFirst: z.boolean().optional() }))
          ])
          .optional(),
        embed: z.array(z.object({ table: z.string(), columns: z.array(z.string()).optional() })).optional(),
        offset: z.number().int().min(0).optional(),
        count: z.enum(['estimated', 'exact']).optional(),
        limit: z.number().int().positive().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ org, ...input }) => withAuth((token) => call(token, 'POST', '/api/v1/org/query', org, input))
  );

  server.registerTool(
    'insert_row',
    {
      title: 'Insert a row',
      description:
        'Add ONE row to any table in your org. `org_id` is filled in for you; naming a different one ' +
        'is refused, not quietly corrected. Never replaces anything — a row that already exists comes ' +
        'back as a collision, and changing it is `update_row`. Several jsonb columns are checked ' +
        'against a real shape before writing (`nodes.data` by `type` — call `describe_node_types` ' +
        'first; `posts.media`, `ad_campaigns.targeting`/`placements`, `canvases.viewport` too); a ' +
        'rejection names the exact field. Others are deliberately free-form. Free.',
      inputSchema: z.object({ org, table: z.string(), values: z.record(z.string(), z.unknown()) }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, ...input }) => withAuth((token) => call(token, 'POST', '/api/v1/org/rows', org, input))
  );

  server.registerTool(
    'describe_node_types',
    {
      title: 'Node data shapes',
      description:
        'What `data` must look like on a `nodes` row, per `type` — the JSON Schema `insert_row`/' +
        '`update_row` actually enforce on `nodes`, not a guess. Omit `type` for all 9 at once; name ' +
        'one to save tokens once you know which you need. Limits (aspect ratios, durations, prompt ' +
        'length) are NOT here — those come from `get_media_models`, because they are a fact of the ' +
        'model, not the node. Free.',
      inputSchema: z.object({
        org,
        type: z
          .enum(['text', 'image', 'video', 'doc', 'iframe', 'social_account_feed', 'social_post_mockup', 'products', 'ads'])
          .optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ org, type }) =>
      withAuth((token) => call(token, 'GET', '/api/v1/org/node-types', org, undefined, type ? { type } : undefined))
  );

  server.registerTool(
    'update_row',
    {
      title: 'Update rows',
      description:
        'Change columns on rows that already exist in your org. Only the columns you send are ' +
        'touched. `where` is required — an update with no filter is refused. At most 50 rows per ' +
        'call, counted before anything is written. Free.',
      inputSchema: z.object({
        org,
        table: z.string(),
        where: z.array(
          z.object({
            column: z.string(),
            op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'cd']),
            value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))]),
            negate: z.boolean().optional()
          })
        ),
        values: z.record(z.string(), z.unknown())
      }),
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ org, ...input }) => withAuth((token) => call(token, 'PUT', '/api/v1/org/rows', org, input))
  );

  server.registerTool(
    'delete_row',
    {
      title: 'Delete rows',
      description:
        'Remove rows that exist, in your org. `where` is required — a delete with no filter is ' +
        'refused. At most 10 rows per call, counted before anything is removed. This does not come ' +
        'back. Free.',
      inputSchema: z.object({
        org,
        table: z.string(),
        where: z.array(
          z.object({
            column: z.string(),
            op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'cd']),
            value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))]),
            negate: z.boolean().optional()
          })
        )
      }),
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ org, ...input }) => withAuth((token) => call(token, 'DELETE', '/api/v1/org/rows', org, input))
  );
}
