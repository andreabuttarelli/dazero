import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { ENTRY_DEPS, enterApp } from '$lib/server/tenancy/entry';
import { ORG_COOKIE } from '$lib/server/tenancy/context';
import { listProjects, createProject } from '$lib/server/repos/projects';
import { listCanvases, createCanvas } from '$lib/server/repos/canvas';
import { listMemberships } from '$lib/server/repos/orgs';
import { createFirstOrg } from '$lib/server/tenancy/bootstrap';
import { chooseOrg } from '$lib/server/tenancy/context';
import { ensureProfile } from '$lib/server/repos/profiles';

/**
 * LA DASHBOARD DEI PROGETTI.
 *
 * Prima si atterrava dentro una tela. Adesso `/` è il posto dove si sceglie CON COSA lavorare:
 * un progetto è un insieme di tele con le sue pagine, e qui si vede l'elenco.
 *
 * Il bootstrap silenzioso resta per il profilo e la prima org — senza non esiste nient'altro —
 * ma non scarica più dentro una tela. Un progetto si apre con un clic, non per inerzia.
 */
export const load: PageServerLoad = async ({ cookies, locals }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) {
    throw redirect(303, '/login');
  }

  const db = await locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  await enterApp(db, ENTRY_DEPS, user, cookies.get(ORG_COOKIE) ?? null);

  const profile = await ensureProfile(db, user);
  const memberships = await listMemberships(db, user.id);
  const membership = chooseOrg(memberships, cookies.get(ORG_COOKIE) ?? null);
  if (!membership) {
    throw redirect(303, '/login');
  }

  const orgId = membership.org.id;
  const projects = await listProjects(db, orgId);

  const cards = [] as { id: string; name: string; slug: string; canvasCount: number; href: string; canvasHref: string | null }[];
  for (const project of projects) {
    const canvases = await listCanvases(db, { orgId, projectId: project.id });
    cards.push({
      id: project.id,
      name: project.name,
      slug: project.slug,
      canvasCount: canvases.length,
      href: `/p/${project.id}`,
      canvasHref: canvases[0] ? `/p/${project.id}/c/${canvases[0].id}` : null
    });
  }

  return {
    profile: { name: profile.name, email: profile.email },
    org: { id: orgId, name: membership.org.name, slug: membership.org.slug },
    workspaces: memberships.map((m) => ({ id: m.org.id, name: m.org.name, slug: m.org.slug })),
    projects: cards
  };
};

export const actions: Actions = {
  /** Un progetto nuovo nasce già con una tela: un progetto senza tele non ha dove atterrare. */
  create: async ({ locals }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) {
      return fail(401, { error: 'not_authenticated' });
    }

    const db = await locals.db();
    if (!db) {
      return fail(500, { error: 'sessione senza client' });
    }

    const memberships = await listMemberships(db, user.id);
    const membership = chooseOrg(memberships, null);
    const orgId = membership?.org.id ?? (await createFirstOrg({ userId: user.id, name: 'My workspace' })).orgId;

    const project = await createProject(db, { orgId, name: 'Untitled', slug: `untitled-${Date.now().toString(36)}`, brandId: null });
    const canvas = await createCanvas(db, { orgId, projectId: project.id, name: 'Untitled' });

    return { projectId: project.id, canvasId: canvas.id, href: `/p/${project.id}/c/${canvas.id}` };
  }
};
