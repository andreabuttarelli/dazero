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

  server.registerTool(
    'apply_effects',
    {
      title: 'Render an effects node',
      description:
        'Renders an `effects` node\'s stack onto its upstream image and lands the result as the ' +
        'node\'s `refId` — the same render `EffectsEditor` does in the browser, run server-side so ' +
        'an agent without a browser can do it. Set the stack first with `update_row` on `nodes.data.' +
        'effects` (see `describe_node_types` for the effect list and their params), then call this. ' +
        'Refused before anything runs if `data.sourceRefId` is empty (nothing upstream to render) — ' +
        'wire an image into the node first. Spends no credits: no AI provider is called.',
      inputSchema: z.object({ org, node_id: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, node_id }) =>
      withAuth((token) =>
        call(token, 'POST', `/api/v1/org/nodes/${encodeURIComponent(node_id)}/apply-effects`, org)
      )
  );

  server.registerTool(
    'run_node_loop',
    {
      title: 'Queue a generation node loop',
      description:
        'QUEUES many combinations from a node\'s `iterate` wires (or plain "repeat N" variants ' +
        'when it has none) to run through the SAME engine `run_node_generation` calls — one real ' +
        'run per combination, never a copy of it. This call returns as soon as the queue is ' +
        'written, NOT when the images exist: combinations run a few at a time as a background tick ' +
        'drains the queue over the following minutes, so 1000 combinations take longer than 50 to ' +
        'finish. Up to 50 queues on the call; above 50 it comes back `needs_confirmation` with the ' +
        'count and the credit cost — call again with `confirm: true`; above 1000 it is refused ' +
        'outright and the loop must be split. Credits for the WHOLE loop are checked up front, not ' +
        'discovered empty halfway. A failed combination never stops the others; results land in an ' +
        'output `list` node next to this one as they finish, each item labelled with which values ' +
        'produced it — poll that node (`query`) to see progress, do not expect it done here.',
      inputSchema: z.object({
        org,
        node_id: z.string(),
        confirm: z.boolean().optional().describe('Required (true) to queue above 50 combinations.')
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, node_id, confirm }) =>
      withAuth((token) =>
        call(token, 'POST', `/api/v1/org/nodes/${encodeURIComponent(node_id)}/loop`, org, { confirm: confirm ?? false })
      )
  );

  server.registerTool(
    'preview_node_loop',
    {
      title: 'Preview a node\'s loop',
      description:
        'How many combinations `run_node_loop` would queue on this node right now, and what they ' +
        'would cost — reads only, spends nothing. Call this before `run_node_loop` when the count ' +
        'is not already known, rather than guessing at whether confirm will be needed.',
      inputSchema: z.object({ org, node_id: z.string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ org, node_id }) =>
      withAuth((token) => call(token, 'GET', `/api/v1/org/nodes/${encodeURIComponent(node_id)}/loop`, org))
  );

  server.registerTool(
    'cancel_node_loop',
    {
      title: 'Cancel a queued loop',
      description:
        'Stops the combinations still queued for this node — the ones a tick has already claimed ' +
        'finish regardless, and anything already produced stays in the output list. Returns how ' +
        'many combinations it actually stopped.',
      inputSchema: z.object({ org, node_id: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, node_id }) =>
      withAuth((token) => call(token, 'DELETE', `/api/v1/org/nodes/${encodeURIComponent(node_id)}/loop`, org))
  );
}
