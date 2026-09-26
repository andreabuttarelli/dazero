import { describe, expect, it } from 'vitest';
import { findCanvasForUser } from '$lib/server/canvas/lookup';
import { fakeDb, filtersOf } from '$lib/server/db/fake-db';
import type { Membership } from '$lib/server/repos/orgs';

const ORG = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const CANVAS = '33333333-3333-3333-3333-333333333333';
const PROJECT = '44444444-4444-4444-4444-444444444444';

const membership = (id: string): Membership => ({
  org: { id, name: 'Acme', slug: 'acme' },
  role: 'owner'
});

const row = { id: CANVAS, project_id: PROJECT, name: 'Untitled', viewport: null };

describe('aprire una tela dal suo id', () => {
  it('senza appartenenze non apre niente, e non chiede niente al database', async () => {
    const { db, calls } = fakeDb({ canvases: [row] });

    expect(await findCanvasForUser(db, { canvasId: CANVAS, memberships: [] })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("ogni lettura porta l'org: un id preso dall'URL non è di chi lo scrive", async () => {
    const { db, calls } = fakeDb({ canvases: [row] });

    await findCanvasForUser(db, { canvasId: CANVAS, memberships: [membership(ORG)] });

    expect(filtersOf(calls, 'select')).toMatchObject({ id: CANVAS, org_id: ORG });
  });

  it("una tela che nessuna sua org contiene non si apre", async () => {
    const { db } = fakeDb({ canvases: [] });

    expect(
      await findCanvasForUser(db, { canvasId: CANVAS, memberships: [membership(OTHER)] })
    ).toBeNull();
  });

  it("torna l'org che l'ha aperta, non solo la tela: chi scrive dopo ne ha bisogno", async () => {
    const { db } = fakeDb({ canvases: [row] });

    expect(
      await findCanvasForUser(db, { canvasId: CANVAS, memberships: [membership(ORG)] })
    ).toEqual({
      orgId: ORG,
      canvas: { id: CANVAS, projectId: PROJECT, name: 'Untitled', viewport: null }
    });
  });

  it('trovata nella prima org, la seconda non si chiede nemmeno', async () => {
    const { db, calls } = fakeDb({ canvases: [row] });

    await findCanvasForUser(db, {
      canvasId: CANVAS,
      memberships: [membership(ORG), membership(OTHER)]
    });

    expect(calls).toHaveLength(1);
  });
});
