import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CANVAS_NAME, DEFAULT_PROJECT_NAME, canvasPath, enterApp, workspaceNameFor } from '$lib/server/tenancy/entry';
import type { Db } from '$lib/server/db/client';
import type { Membership } from '$lib/server/repos/orgs';
import type { User } from '@supabase/supabase-js';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const PROJECT = '33333333-3333-3333-3333-333333333333';
const CANVAS = '44444444-4444-4444-4444-444444444444';

const user = { id: USER, email: 'chi@esempio.it', user_metadata: {} } as unknown as User;

const membership: Membership = { org: { id: ORG, name: 'chi', slug: 'chi-abcd' }, role: 'owner' };
const project = { id: PROJECT, name: DEFAULT_PROJECT_NAME, slug: 'untitled', brandId: null, archivedAt: null };
const canvas = { id: CANVAS, projectId: PROJECT, name: DEFAULT_CANVAS_NAME, viewport: null };

/** I collaboratori del bootstrap, sostituiti uno per uno: il test guarda QUANTE volte si crea. */
function deps(overrides: Partial<Parameters<typeof enterApp>[1]>) {
  return {
    ensureProfile: vi.fn(async () => ({ id: USER, email: 'chi@esempio.it', name: null, avatarUrl: null })),
    listMemberships: vi.fn(async () => [membership]),
    createFirstOrg: vi.fn(async () => ({ orgId: ORG, slug: 'chi-abcd', role: 'owner' as const })),
    listProjects: vi.fn(async () => [project]),
    createProject: vi.fn(async () => project),
    listCanvases: vi.fn(async () => [canvas]),
    createCanvas: vi.fn(async () => canvas),
    ...overrides
  };
}

const db = {} as Db;

describe('il nome di uno spazio nuovo non si chiede a nessuno', () => {
  it("viene dalla parte locale dell'email", () => {
    expect(workspaceNameFor({ ...user, email: 'andrea@teta.so' } as User)).toBe('andrea');
  });

  it('senza email resta un nome neutro, non una stringa vuota', () => {
    expect(workspaceNameFor({ ...user, email: null } as unknown as User)).toBe('My workspace');
  });
});

describe('entrare la prima volta crea tutto, una volta sola', () => {
  it('due schede al primo accesso non creano due organizzazioni', async () => {
    const d = deps({ listMemberships: vi.fn(async () => []) });
    await Promise.all([enterApp(db, d, user), enterApp(db, d, user)]);
    expect(d.createFirstOrg).toHaveBeenCalledOnce();
  });
  it('un utente senza org ne riceve una, con progetto e tela', async () => {
    const d = deps({ listMemberships: vi.fn(async () => []) });

    const entry = await enterApp(db, d, user);

    expect(d.createFirstOrg).toHaveBeenCalledOnce();
    expect(entry).toEqual({ orgId: ORG, projectId: PROJECT, canvasId: CANVAS });
  });

  it('il profilo nasce prima di tutto: orgs_members lo referenzia', async () => {
    const d = deps({ listMemberships: vi.fn(async () => []) });

    await enterApp(db, d, user);

    expect(d.ensureProfile).toHaveBeenCalledOnce();
  });

  it('un progetto nasce senza brand: è il caso normale', async () => {
    const d = deps({ listMemberships: vi.fn(async () => []), listProjects: vi.fn(async () => []) });

    await enterApp(db, d, user);

    expect(d.createProject).toHaveBeenCalledWith(db, expect.objectContaining({ orgId: ORG, brandId: null }));
  });
});

describe('entrare la seconda volta non duplica niente', () => {
  it('riapre lo spazio scelto quando l utente appartiene a più org', async () => {
    const chosenOrg = '55555555-5555-5555-5555-555555555555';
    const d = deps({ listMemberships: vi.fn(async () => [
      membership,
      { ...membership, org: { ...membership.org, id: chosenOrg } }
    ]) });

    const entry = await enterApp(db, d, user, chosenOrg);

    expect(entry.orgId).toBe(chosenOrg);
    expect(d.listProjects).toHaveBeenCalledWith(db, chosenOrg);
  });

  it("chi ha già un'org non ne crea un'altra", async () => {
    const d = deps({});

    await enterApp(db, d, user);

    expect(d.createFirstOrg).not.toHaveBeenCalled();
  });

  it('chi ha già un progetto non ne crea un altro', async () => {
    const d = deps({});

    await enterApp(db, d, user);

    expect(d.createProject).not.toHaveBeenCalled();
  });

  it('chi ha già una tela ci rientra dentro', async () => {
    const d = deps({});

    const entry = await enterApp(db, d, user);

    expect(d.createCanvas).not.toHaveBeenCalled();
    expect(entry.canvasId).toBe(CANVAS);
  });

  it('un progetto senza tele ne riceve una, senza toccare il progetto', async () => {
    const d = deps({ listCanvases: vi.fn(async () => []) });

    await enterApp(db, d, user);

    expect(d.createProject).not.toHaveBeenCalled();
    expect(d.createCanvas).toHaveBeenCalledOnce();
  });
});

describe('la tela ha un indirizzo, e non è quello del brand', () => {
  it('il percorso è scopato sulla tela, non sul brand', () => {
    expect(canvasPath(PROJECT, CANVAS)).toBe(`/p/${PROJECT}/c/${CANVAS}`);
  });
});
