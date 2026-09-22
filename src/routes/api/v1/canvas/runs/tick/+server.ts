import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createServiceRoleDb } from '$lib/server/db/client';
import { SERVICE_ROLE_USES } from '$lib/server/db/service-role-uses';
import { cronAuthorized } from '$lib/server/cron-auth';
import { expireStuckRuns } from '$lib/server/canvas/generate';

// Una scansione di righe scadute, mai un'attesa su un provider: sta sotto il default anche senza
// dichiararlo, ma lo dichiara come ogni altra rotta che gira per un cron.
export const config = { maxDuration: 60 };

const USE = SERVICE_ROLE_USES.find((u) => u.path.startsWith('src/routes/api/v1/canvas/runs/tick'))!;

export const GET: RequestHandler = async ({ request }) => {
  if (!cronAuthorized(request)) return json({ error: 'Unauthorized' }, { status: 401 });

  const result = await expireStuckRuns(createServiceRoleDb(USE)).catch((e) => {
    console.error('[canvas runs] tick failed', e);
    return { expired: 0 };
  });

  return json(result);
};

export const POST = GET;
