import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { request } from '../../lib/api.ts';
import { withAuth } from '../util.ts';

/**
 * IL CLICK «GENERA» SULLA TELA, PER UN AGENTE. Non crea un nodo — quello è `insert_row` — genera
 * DENTRO uno che esiste già: `medium` deve corrispondere al `type` del nodo, o il server rifiuta
 * prima di spendere. Un video non torna mai pronto in questa chiamata: arriva `queued` con un
 * `external_job_id`, e un tick successivo (un cron, non questo tool) deposita il risultato — il
 * nodo resta `running` fino a lì. Un agente che aspetta un file qui aspetta per sempre.
 */
const org = z.string().optional().describe('Which org, if you belong to more than one.');

function call<T>(
  token: string,
  method: string,
  path: string,
  org: string | undefined,
  body?: unknown
): Promise<T> {
  const qs = new URLSearchParams(org ? { org } : {});
  const suffix = qs.toString() ? `?${qs}` : '';
  return request<T>(`${path}${suffix}`, token, { method, body: body ? JSON.stringify(body) : undefined });
}

export function registerNodeTools(server: McpServer) {
  server.registerTool(
    'run_node_generation',
    {
      title: 'Generate a node\'s content',
      description:
        'Generate into an existing canvas node — text, image or video. This is the same engine ' +
        'the canvas Generate button calls; it never creates a node (`insert_row` does that). ' +
        '`medium` MUST match the node\'s own type, or the call is refused before anything is spent. ' +
        'Pass `version` as the node\'s current `nodes.version`: a stale value comes back `conflict` ' +
        '(never a silent overwrite) — re-read the node and retry with the fresh version. ' +
        'A `video` NEVER returns finished here: it comes back `queued` with an `external_job_id` on ' +
        'the run, and the render lands later, asynchronously — the node stays `running` until a ' +
        'later tick deposits the asset. Poll the node (`query`) rather than expecting a file now. ' +
        'Spends credits; a `credits_exhausted` failure means the org is out.',
      inputSchema: z.object({
        org,
        node_id: z.string(),
        medium: z.enum(['text', 'image', 'video']),
        prompt: z.string(),
        model: z.string(),
        version: z.number().int(),
        params: z.record(z.string(), z.unknown()).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, node_id, ...input }) =>
      withAuth((token) =>
        call(token, 'POST', `/api/v1/org/nodes/${encodeURIComponent(node_id)}/generate`, org, {
          ...input,
          params: input.params ?? {}
        })
      )
  );
}
