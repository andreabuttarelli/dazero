import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticate, loadBrandForUser, checkApiKeyWriteAccess } from '$lib/server/cli-auth';
import { createAdminClient } from '$lib/server/supabase-admin';
import { createArticle } from '$lib/server/article-editing';
import { CREATE_ARTICLE, statusForFailure } from '@dazero/api-contracts';

const DEFAULT_TIMEZONE = 'Europe/Rome';

// Scrive col client admin perché `brand_articles` ha una sola policy RLS, `for select`: un
// insert con la sessione dell'utente verrebbe rifiutato da Postgres.
export const POST: RequestHandler = async ({ request, params }) => {
  const { supabase, error, apiKey } = await authenticate(request);
  if (error) return error;

  const { brand, error: brandError } = await loadBrandForUser(supabase, params.slug, apiKey);
  if (brandError) return brandError;

  const writeDenied = checkApiKeyWriteAccess(apiKey);
  if (writeDenied) return writeDenied;

  const parsed = CREATE_ARTICLE.input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: 'invalid_input', details: parsed.error.issues }, { status: 400 });
  }

  const result = await createArticle({
    client: createAdminClient(),
    brandId: brand.id,
    timezone: (brand.timezone as string) ?? DEFAULT_TIMEZONE,
    draft: parsed.data
  });

  if (!result.ok) {
    return json({ error: result.error }, { status: statusForFailure(CREATE_ARTICLE, result.error) });
  }

  return json({ ok: true, article: result.article });
};
