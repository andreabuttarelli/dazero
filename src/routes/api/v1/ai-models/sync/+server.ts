import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/server/supabase-admin';
import { cronAuthorized } from '$lib/server/cron-auth';
import { syncAiModels } from '$lib/server/ai-models-sync';

/**
 * IL CRON DI `ai_models`: chiede il listino a OpenRouter, scrive le righe.
 *
 * Ogni sei ore, come `knowledge/sources/work` per lo stesso motivo — non e' un dato che cambia
 * minuto per minuto, ed e' un giro di rete che non vale la pena ripetere piu' spesso. Un fallimento
 * qui non toglie nulla: le righe di ieri restano, con `synced_at` che lo dice.
 */
export const GET: RequestHandler = async ({ request }) => {
  if (!cronAuthorized(request)) return new Response('Unauthorized', { status: 401 });

  const admin = createAdminClient();
  const out = await syncAiModels(admin);

  return new Response(JSON.stringify(out), {
    status: out.ok ? 200 : 502,
    headers: { 'content-type': 'application/json' }
  });
};
