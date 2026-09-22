import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { listMemberships } from '$lib/server/repos/orgs';
import { listProjects } from '$lib/server/repos/projects';
import { listCanvases } from '$lib/server/repos/canvas';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { chooseOrg } from '$lib/server/tenancy/context';
import { ensureProfile } from '$lib/server/repos/profiles';
import { PROJECT_BRAND_SHELL_SELECT, type ProjectBrandShell } from '$lib/server/projects/brand-shell';
import { env } from '$env/dynamic/private';

const FLAGS = {
  connectors: env.FEATURE_CONNECTORS !== 'false',
  navTeam: env.FEATURE_NAV_TEAM === 'true'
};

/**
 * IL GUSCIO DEL PROGETTO: la stessa pagina di `/app/[brand]`, con il progetto al posto del brand.
 *
 * Il progetto è il contenitore — tele, pagine, materiali. Il brand resta una PROPRIETÀ del
 * progetto (`projects.brand_id`, nullable): si apre una tela per esplorare, e solo quando il
 * materiale diventa qualcosa da pubblicare si decide per chi.
 */
export const load: LayoutServerLoad = async ({ params, locals }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) {
    throw redirect(303, '/login');
  }

  const db = await locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  const profile = await ensureProfile(db, user);
  const memberships = await listMemberships(db, user.id);
  const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
  if (!found) {
    throw error(404, 'questo progetto non esiste, o non è tuo');
  }

  const { orgId, project } = found;
  const membership = memberships.find((m) => m.org.id === orgId)!;
  const projects = await listProjects(db, orgId);
  const canvases = await listCanvases(db, { orgId, projectId: project.id });

  let brand: ProjectBrandShell | null = null;
  if (project.brandId) {
    const { data } = await db
      .from('brands')
      .select(PROJECT_BRAND_SHELL_SELECT)
      .eq('id', project.brandId)
      .eq('org_id', orgId)
      .maybeSingle();
    brand = (data as ProjectBrandShell | null) ?? null;
  }

  return {
    profile: { name: profile.name, email: profile.email, avatarUrl: profile.avatarUrl },
    org: { id: orgId, name: membership.org.name, slug: membership.org.slug, role: membership.role },
    project,
    brand,
    projects: projects.map((p) => {
      const first = p.id === project.id ? canvases[0] : undefined;
      return { id: p.id, name: p.name, slug: p.slug, href: `/p/${p.id}`, brandId: p.brandId, active: p.id === project.id, firstCanvasId: first?.id ?? null };
    }),
    canvases: canvases.map((c) => ({ id: c.id, name: c.name, href: `/p/${project.id}/c/${c.id}` })),
    workspaces: memberships.map((m) => ({ id: m.org.id, name: m.org.name, slug: m.org.slug, href: '/app' })),
    flags: FLAGS
  };
};
