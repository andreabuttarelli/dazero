import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * LA SESSIONE USA-E-GETTA CHE OGNI SPEC `@real` COSTRUISCE SOPRA. Stesso pattern di
 * `scripts/eval/canvas.ts` e `scripts/eval/gen-node.ts` (service role per seminare
 * org/progetto/tela, teardown SEMPRE in `finally`): non è codice applicativo, quindi non passa
 * da `createServiceRoleDb` e non serve una voce in `service-role-uses.ts`.
 *
 * IL LOGIN È QUELLO VERO: si compila il form su `/login` e si aspetta il redirect, non si
 * inietta un cookie fatto a mano. È più lento di un bypass, ma prova che `hooks.server.ts` legge
 * davvero la sessione che Supabase ha scritto — un bypass che salta quel codice non lo esercita.
 */
export type E2eSession = {
  userId: string;
  email: string;
  password: string;
  orgId: string;
  projectId: string;
  canvasId: string;
  canvasName: string;
};

const UPLOAD_BUCKET = 'canvas-assets';

function adminClient(): SupabaseClient {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('E2E_REAL_STACK=1 richiede PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY veri');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function checked<T>(result: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const response = await result;
  if (response.error) {
    throw new Error(response.error.message);
  }
  return response.data;
}

export async function createE2eSession(): Promise<E2eSession> {
  const db = adminClient();
  const email = `e2e-shell-${randomUUID()}@dazero.co`;
  const password = randomUUID();

  const created = await checked(db.auth.admin.createUser({ email, password, email_confirm: true }));
  if (!created.user) {
    throw new Error('e2e fixture: createUser non ha restituito un utente');
  }
  const userId = created.user.id;

  const orgId = randomUUID();
  const projectId = randomUUID();
  const canvasId = randomUUID();
  const canvasName = 'Prima tela';

  await checked(db.from('profiles').upsert({ id: userId, email, name: 'E2E shell' }));
  await checked(db.from('orgs').insert({ id: orgId, name: 'E2E shell', slug: `e2e-shell-${orgId}` }));
  await checked(db.from('orgs_members').insert({ org_id: orgId, user_id: userId, role: 'owner' }));
  await checked(db.from('projects').insert({ id: projectId, org_id: orgId, name: 'E2E project', slug: `e2e-project-${projectId}` }));
  await checked(db.from('canvases').insert({ id: canvasId, org_id: orgId, project_id: projectId, name: canvasName }));

  return { userId, email, password, orgId, projectId, canvasId, canvasName };
}

/** Cancella nell'ordine giusto: la org porta via progetto e tela per cascata, lo Storage no —
 *  vive fuori da Postgres e va ripulito a parte, sul prefisso `${orgId}/${projectId}/`. L'utente
 *  resta per ultimo perché `auth.users` non è nello schema pubblico. */
export async function teardownE2eSession(session: E2eSession): Promise<void> {
  const db = adminClient();

  const { data: files } = await db.storage.from(UPLOAD_BUCKET).list(`${session.orgId}/${session.projectId}`);
  if (files?.length) {
    const paths = files.map((f) => `${session.orgId}/${session.projectId}/${f.name}`);
    await db.storage.from(UPLOAD_BUCKET).remove(paths);
  }

  await db.from('orgs').delete().eq('id', session.orgId);
  await db.auth.admin.deleteUser(session.userId);
}

/**
 * OGNI NAVIGAZIONE DI QUESTA SUITE PASSA DA QUI, non da `page.goto` nudo: in dev Vite compila
 * `+page.svelte` al volo, e un `click`/`fill` sparato prima che Svelte abbia agganciato
 * `use:enhance` invia un POST che il browser naviga per davvero invece di intercettare — un form
 * che sembra rotto ma è solo non ancora idratato. Un'unica funzione qui evita che ogni spec
 * scopra la stessa corsa per conto suo, con un `waitForLoadState` dimenticato in una e non
 * nell'altra.
 */
export async function gotoHydrated(page: Page, path: string): Promise<import('@playwright/test').Response | null> {
  const response = await page.goto(path);
  await page.waitForLoadState('networkidle');
  return response;
}

export async function signInE2e(page: Page, session: Pick<E2eSession, 'email' | 'password'>): Promise<void> {
  await gotoHydrated(page, '/login');
  await page.getByPlaceholder('you@yourbrand.com').fill(session.email);
  await page.locator('input[type="password"]').fill(session.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(app|p\/)/);
}

type CanvasNodeSeed = {
  type: string;
  x?: number;
  y?: number;
  data?: Record<string, unknown>;
};

/** Test fixtures: `{ page, orgId, projectId, canvasId, userId, admin }`, più `seedNode` per una
 *  precondizione che una spec vuole già scritta prima di aprire il browser. */
export const test = base.extend<{
  session: E2eSession;
  admin: SupabaseClient;
  seedNode: (seed: CanvasNodeSeed) => Promise<{ id: string; version: number }>;
}>({
  session: async ({}, use) => {
    const session = await createE2eSession();
    try {
      await use(session);
    } finally {
      await teardownE2eSession(session);
    }
  },

  admin: async ({}, use) => {
    await use(adminClient());
  },

  page: async ({ page, session }, use) => {
    await signInE2e(page, session);
    await use(page);
  },

  seedNode: async ({ session, admin }, use) => {
    await use(async (seed: CanvasNodeSeed) => {
      const id = randomUUID();
      const row = await checked(
        admin
          .from('nodes')
          .insert({
            id,
            org_id: session.orgId,
            project_id: session.projectId,
            canvas_id: session.canvasId,
            type: seed.type,
            x: seed.x ?? 0,
            y: seed.y ?? 0,
            data: seed.data ?? {},
            actor_kind: 'user',
            actor_id: session.userId
          })
          .select('id, version')
          .single()
      );
      return row as { id: string; version: number };
    });
  }
});

export { expect };

export const REAL_STACK = process.env.E2E_REAL_STACK === '1';
