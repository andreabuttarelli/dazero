import { z } from 'zod';
import type { BrandEndpoint } from './index';

export const ENHANCE_PROMPT = {
  tool: 'enhance_prompt',
  title: 'Rewrite a prompt for the model that will render it',
  description:
    'Rewrites a brief into the SHAPE the model you are about to render with wants — one reads ' +
    'labelled sections, another one flowing paragraph, another a command when it edits. Pass the ' +
    '`model` (`get_media_models` lists them) and use the `prompt` that comes back to render. ' +
    'It rewrites, it never invents: a rewrite ' +
    'that adds a subject, asks for readable text or states an aspect ratio is thrown away and the ' +
    'original returns with `changed: false` and the reason in `notes`, as does a model we have no ' +
    'guide for. Draws nothing, files nothing. Spends credits.',
  method: 'POST',
  pathUnderBrand: '/prompts/enhance',
  pathWithoutBrand: '/prompts/enhance',
  input: z
    .object({
      prompt: z.string().min(1).describe('The brief as it is written now'),
      model: z
        .string()
        .min(1)
        .describe('The image or video model you are about to render with — see get_media_models'),
      shot_mode: z
        .enum(['hero', 'flat-lay', 'on-model', 'close-up', 'lifestyle', 'studio'])
        .optional()
        .describe('For a product photo: which kind of shot this is, so the brief is ordered the way that shot needs')
    })
    .strict(),
  output: z.object({
    prompt: z.string().describe('The rewritten brief, or the original one when nothing was changed'),
    model: z.string(),
    changed: z.boolean().describe('False when the original came back untouched — `notes` says why'),
    notes: z.array(z.string()).describe('What was done, or why it was not')
  }),
  failures: [{ error: 'credits_exhausted', status: 402 }],
  destructive: false
} satisfies BrandEndpoint;
