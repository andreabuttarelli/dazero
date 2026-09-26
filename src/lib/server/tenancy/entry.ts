import type { User } from '@supabase/supabase-js';
import type { Db } from '$lib/server/db/client';
import { ensureProfile } from '$lib/server/repos/profiles';
import { listMemberships } from '$lib/server/repos/orgs';
import { createProject, listProjects } from '$lib/server/repos/projects';
import { createCanvas, listCanvases } from '$lib/server/repos/canvas';
import { createFirstOrg } from '$lib/server/tenancy/bootstrap';
import { chooseOrg } from '$lib/server/tenancy/context';

/**
 * ENTRARE NELL'APP È UN BOOTSTRAP SILENZIOSO, NON UN MODULO DA COMPILARE.
 *
 *   profilo ──> org ──> progetto ──> tela ──> si apre la tela
 *
 * Ogni gradino è IDEMPOTENTE: cerca, e crea solo se non trova. Una seconda visita percorre la
 * stessa scala senza costruirne una nuova, e chi ha già tutto entra al primo colpo. L'ordine non
 * è estetico — `orgs_members.user_id` referenzia `profiles`, e la tela referenzia il progetto:
 * saltare un gradino è una violazione di chiave esterna, non un difetto di stile.
 *
 * Le dipendenze arrivano come argomento perché è ciò che rende provabile «non crea due volte»
 * senza un database: la domanda è quante volte si chiama la creazione, non cosa torna.
 */
export const DEFAULT_PROJECT_NAME = 'Untitled';
export const DEFAULT_CANVAS_NAME = 'Untitled';
const DEFAULT_WORKSPACE_NAME = 'My workspace';
const DEFAULT_PROJECT_SLUG = 'untitled';

export type Entry = { orgId: string; projectId: string; canvasId: string };

export type EntryDeps = {
  ensureProfile: typeof ensureProfile;
  listMemberships: typeof listMemberships;
  createFirstOrg: typeof createFirstOrg;
  listProjects: typeof listProjects;
  createProject: typeof createProject;
  listCanvases: typeof listCanvases;
  createCanvas: typeof createCanvas;
};

export const ENTRY_DEPS: EntryDeps = {
  ensureProfile,
  listMemberships,
  createFirstOrg,
  listProjects,
  createProject,
  listCanvases,
  createCanvas
};

/** Il canvas vive DENTRO il progetto: `/p/<projectId>/c/<canvasId>`, come le altre pagine del progetto. */
export function canvasPath(projectId: string, canvasId: string): string {
  return `/p/${projectId}/c/${canvasId}`;
}

export function workspaceNameFor(user: User): string {
  return user.email?.split('@')[0] || DEFAULT_WORKSPACE_NAME;
}

type FirstOrgResult = Awaited<ReturnType<EntryDeps['createFirstOrg']>>;

/**
 * DUE SCHEDE AL PRIMO ACCESSO, UNA SOLA ORG.
 *
 * `listMemberships` risponde vuoto a entrambe e la creazione partirebbe due volte. La promessa
 * è una sola per utente: chi arriva mentre la prima è in corso la riusa, invece di aprirne un'altra.
 */
const firstOrgFlights = new Map<string, Promise<FirstOrgResult>>();

function firstOrgOnce(
  create: EntryDeps['createFirstOrg'],
  input: { userId: string; name: string }
): Promise<FirstOrgResult> {
  const pending = firstOrgFlights.get(input.userId);
  if (pending) {
    return pending;
  }

  const flight = create(input).finally(() => firstOrgFlights.delete(input.userId));
  firstOrgFlights.set(input.userId, flight);
  return flight;
}

async function orgIdFor(db: Db, deps: EntryDeps, user: User, chosenOrgId: string | null): Promise<string> {
  const memberships = await deps.listMemberships(db, user.id);
  const membership = chooseOrg(memberships, chosenOrgId);
  if (membership) {
    return membership.org.id;
  }

  const { orgId } = await firstOrgOnce(deps.createFirstOrg, {
    userId: user.id,
    name: workspaceNameFor(user)
  });
  return orgId;
}

async function projectIdFor(db: Db, deps: EntryDeps, orgId: string): Promise<string> {
  const projects = await deps.listProjects(db, orgId);
  if (projects.length > 0) {
    return projects[0].id;
  }

  const project = await deps.createProject(db, {
    orgId,
    name: DEFAULT_PROJECT_NAME,
    slug: DEFAULT_PROJECT_SLUG,
    brandId: null
  });
  return project.id;
}

async function canvasIdFor(db: Db, deps: EntryDeps, scope: { orgId: string; projectId: string }): Promise<string> {
  const canvases = await deps.listCanvases(db, scope);
  if (canvases.length > 0) {
    return canvases[0].id;
  }

  const canvas = await deps.createCanvas(db, { ...scope, name: DEFAULT_CANVAS_NAME });
  return canvas.id;
}

export async function enterApp(db: Db, deps: EntryDeps, user: User, chosenOrgId: string | null = null): Promise<Entry> {
  await deps.ensureProfile(db, user);

  const orgId = await orgIdFor(db, deps, user, chosenOrgId);
  const projectId = await projectIdFor(db, deps, orgId);
  const canvasId = await canvasIdFor(db, deps, { orgId, projectId });

  return { orgId, projectId, canvasId };
}
