import type { RequestHandler } from './$types';
import { cronAuthorized } from '$lib/server/cron-auth';
import { createAdminClient } from '$lib/server/supabase-admin';
import { collectOrphans } from '$lib/server/storage-collect';

/**
 * I FILE CHE NESSUNA RIGA NOMINA PIÙ, contati — e tolti solo se lo si chiede.
 *
 * Una GET risponde «toglierei questi N, ecco i primi 50» e non tocca niente. `?mode=collect` è
 * l'unica forma che cancella, e non è il default: la prima misura fatta su questo bucket diceva
 * 8.022 orfani su 8.054 ed era falsa, perché guardava una tabella sola. Un elenco letto vale il
 * prezzo di un giro in più.
 *
 * NON è ancora nei cron di `vercel.json`, deliberatamente: prima va guardato in sola lettura per
 * qualche giorno, poi si accende. Accendere un raccoglitore mai osservato è il modo di scoprire
 * dalla segnalazione di un cliente che l'area coperta non era quella che si credeva.
 *
 * Service role, non sessione: l'inventario sta in `storage.objects`, che la RLS di un utente non
 * fa vedere, e i file di cui si parla attraversano tutti i brand.
 */
export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request, url }) => {
  if (!cronAuthorized(request)) return new Response('Unauthorized', { status: 401 });

  const mode = url.searchParams.get('mode') === 'collect' ? 'collect' : 'report';
  const out = await collectOrphans(createAdminClient(), { mode });

  return Response.json(out, { status: 'error' in out ? 500 : 200 });
};
