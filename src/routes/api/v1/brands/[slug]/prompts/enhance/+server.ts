import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticate, loadBrandForUser, gateAiAction } from '$lib/server/cli-auth';
import { enhancePrompt } from '$lib/server/prompt-enhance';
import { withBrandContext } from '$lib/server/ai-log';
import { ENHANCE_PROMPT } from '@anomalia/api-contracts';

export const POST: RequestHandler = async ({ request, params }) => {
  const { supabase, error, apiKey } = await authenticate(request);
  if (error) return error;

  const { brand, error: brandError } = await loadBrandForUser(supabase, params.slug, apiKey);
  if (brandError) return brandError;

  const gate = await gateAiAction(brand, apiKey);
  if (gate) return gate;

  const parsed = ENHANCE_PROMPT.input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: 'invalid_input', details: parsed.error.issues }, { status: 400 });
  }

  const result = await withBrandContext(brand.id, () =>
    enhancePrompt({
      prompt: parsed.data.prompt,
      model: parsed.data.model,
      shotMode: parsed.data.shot_mode
    })
  );

  return json(result);
};
