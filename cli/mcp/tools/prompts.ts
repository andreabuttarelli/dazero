import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { request } from '../../lib/api.ts';
import { withAuth } from '../util.ts';

/**
 * RISCRIVERE UN BRIEF NELLA FORMA CHE UN MODELLO VUOLE — `/api/v1/prompts/enhance`, org-scoped,
 * senza brand: la stessa ragione di `/api/v1/images`, non chiede a quale azienda addebitarlo.
 */
const org = z.string().optional().describe('Which org, if you belong to more than one.');

export function registerPromptTools(server: McpServer) {
  server.registerTool(
    'enhance_prompt',
    {
      title: 'Rewrite a prompt for the model that will render it',
      description:
        'Rewrites a brief into the SHAPE the model you are about to render with wants — one reads ' +
        'labelled sections, another one flowing paragraph, another a command when it edits. Pass the ' +
        '`model` (`get_media_models` lists them) and use the `prompt` that comes back to render. ' +
        'It rewrites, it never invents: a rewrite ' +
        'that adds a subject, asks for readable text or states an aspect ratio is thrown away and the ' +
        'original returns with `changed: false` and the reason in `notes`, as does a model we have no ' +
        'guide for. Draws nothing, files nothing. Spends credits.',
      inputSchema: z.object({
        org,
        prompt: z.string().min(1),
        model: z.string().min(1),
        shot_mode: z.enum(['hero', 'flat-lay', 'on-model', 'close-up', 'lifestyle', 'studio']).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ org, prompt, model, shot_mode }) =>
      withAuth((token) => {
        const qs = new URLSearchParams(org ? { org } : {});
        const suffix = qs.toString() ? `?${qs}` : '';
        return request(`/api/v1/prompts/enhance${suffix}`, token, {
          method: 'POST',
          body: JSON.stringify({ prompt, model, shot_mode })
        });
      })
  );
}
