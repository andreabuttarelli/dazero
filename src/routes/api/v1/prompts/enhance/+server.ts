import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openOrgScope } from '$lib/server/cli-auth';
import { enhancePrompt } from '$lib/server/prompt-enhance';
import { withOrgContext } from '$lib/server/ai-log';
import { ENHANCE_PROMPT } from '@anomalia/api-contracts';

// Riscrivere il brief di un gatto non deve chiedere a quale azienda addebitarlo: il disegno vero
// non lo chiede (`/api/v1/images`), e un passo che lo chiedesse rimetterebbe il confine dove
// quella rotta l'ha tolto.
export const POST: RequestHandler = async ({ request }) => {
  const { scope, error } = await openOrgScope(request);
  if (error) return error;

  const parsed = ENHANCE_PROMPT.input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: 'invalid_input', details: parsed.error.issues }, { status: 400 });
  }

  const result = await withOrgContext(scope.orgId, () =>
    enhancePrompt({
      prompt: parsed.data.prompt,
      model: parsed.data.model,
      shotMode: parsed.data.shot_mode
    })
  );

  return json({ ...result, organization: scope.organization });
};
