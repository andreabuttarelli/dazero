import { describe, expect, it, vi } from 'vitest';
import { createPostFromNodes } from './create-post-from-nodes';
import type { SocialPublisher } from '$lib/server/publishing/port';

const ORG = 'org-1';
const USER = 'user-1';
const BRAND = 'brand-1';
const FAKE_DB = {} as never;
const FAKE_PUBLISHER = {} as SocialPublisher;

function fakeBrands(brand: { id: string } | null = { id: BRAND }) {
  return { findBrand: vi.fn().mockResolvedValue(brand) };
}

function fakeAccounts(accounts: { id: string }[] = [{ id: 'account-1' }]) {
  return { listBrandAccounts: vi.fn().mockResolvedValue(accounts) };
}

function fakePromote(post: { id: string; caption: string } = { id: 'post-1', caption: 'la caption scelta' }) {
  return vi.fn().mockResolvedValue(post);
}

function fakeSetStatus() {
  return vi.fn().mockResolvedValue(undefined);
}

function fakeScheduleDelivery(deliveries: { accountId: string; ok: boolean }[] = [{ accountId: 'account-1', ok: true }]) {
  return vi.fn().mockResolvedValue({ deliveries });
}

function deps(over: Partial<{
  brands: ReturnType<typeof fakeBrands>;
  accounts: ReturnType<typeof fakeAccounts>;
  promoteNodesToPost: ReturnType<typeof fakePromote>;
  setPostStatus: ReturnType<typeof fakeSetStatus>;
  scheduleDelivery: ReturnType<typeof fakeScheduleDelivery>;
}> = {}) {
  return {
    brands: over.brands ?? fakeBrands(),
    accounts: over.accounts ?? fakeAccounts(),
    promoteNodesToPost: over.promoteNodesToPost ?? fakePromote(),
    setPostStatus: over.setPostStatus ?? fakeSetStatus(),
    scheduleDelivery: over.scheduleDelivery ?? fakeScheduleDelivery()
  };
}

const BASE_INPUT = {
  orgId: ORG,
  userId: USER,
  brandId: BRAND,
  nodeIds: ['node-1'],
  caption: 'la caption scelta',
  accountIds: ['account-1'],
  mode: { kind: 'draft' as const }
};

describe('createPostFromNodes: draft', () => {
  it('promuove i nodi con la caption scelta e non tocca lo status ne la consegna', async () => {
    const d = deps();

    const result = await createPostFromNodes(FAKE_DB, d, BASE_INPUT, FAKE_PUBLISHER);

    expect(result).toEqual({ ok: true, post: { id: 'post-1', caption: 'la caption scelta' } });
    expect(d.promoteNodesToPost).toHaveBeenCalledWith(
      FAKE_DB,
      expect.anything(),
      expect.objectContaining({
        orgId: ORG,
        brandId: BRAND,
        nodeIds: ['node-1'],
        caption: 'la caption scelta',
        actorId: USER,
        actorKind: 'user'
      })
    );
    expect(d.setPostStatus).not.toHaveBeenCalled();
    expect(d.scheduleDelivery).not.toHaveBeenCalled();
  });
});

describe('createPostFromNodes: schedule', () => {
  it('promuove, approva e consegna via Zernio con la data richiesta', async () => {
    const d = deps();

    const result = await createPostFromNodes(
      FAKE_DB,
      d,
      { ...BASE_INPUT, mode: { kind: 'schedule', at: '2030-01-01T10:00:00.000Z' } },
      FAKE_PUBLISHER
    );

    expect(result).toEqual({ ok: true, post: { id: 'post-1', caption: 'la caption scelta' } });
    expect(d.setPostStatus).toHaveBeenCalledWith(FAKE_DB, { orgId: ORG, postId: 'post-1', status: 'ready' });
    expect(d.scheduleDelivery).toHaveBeenCalledWith(
      FAKE_DB,
      FAKE_PUBLISHER,
      expect.objectContaining({
        orgId: ORG,
        postId: 'post-1',
        accountIds: ['account-1'],
        scheduledFor: '2030-01-01T10:00:00.000Z'
      })
    );
  });

  it('rifiuta chiaramente se il brand non ha account collegati, senza creare un post a meta', async () => {
    const d = deps({ accounts: fakeAccounts([]) });

    const result = await createPostFromNodes(
      FAKE_DB,
      d,
      { ...BASE_INPUT, mode: { kind: 'schedule', at: '2030-01-01T10:00:00.000Z' } },
      FAKE_PUBLISHER
    );

    expect(result).toEqual({ ok: false, error: 'no_connected_accounts' });
    expect(d.promoteNodesToPost).not.toHaveBeenCalled();
  });

  it('rifiuta se un account scelto non appartiene al brand', async () => {
    const d = deps({ accounts: fakeAccounts([{ id: 'other-account' }]) });

    const result = await createPostFromNodes(
      FAKE_DB,
      d,
      { ...BASE_INPUT, mode: { kind: 'schedule', at: '2030-01-01T10:00:00.000Z' } },
      FAKE_PUBLISHER
    );

    expect(result).toEqual({ ok: false, error: 'accounts_not_found' });
    expect(d.promoteNodesToPost).not.toHaveBeenCalled();
  });

  it('se ogni consegna Zernio fallisce, il post non passa a ready e lo dice, non finge riuscito', async () => {
    const d = deps({ scheduleDelivery: fakeScheduleDelivery([{ accountId: 'account-1', ok: false }]) });

    const result = await createPostFromNodes(
      FAKE_DB,
      d,
      { ...BASE_INPUT, mode: { kind: 'schedule', at: '2030-01-01T10:00:00.000Z' } },
      FAKE_PUBLISHER
    );

    expect(result).toEqual({ ok: false, error: 'delivery_failed', postId: 'post-1' });
    expect(d.setPostStatus).not.toHaveBeenCalled();
  });
});

describe('createPostFromNodes: validazioni', () => {
  it('rifiuta un brand che non appartiene a questa org', async () => {
    const d = deps({ brands: fakeBrands(null) });

    const result = await createPostFromNodes(FAKE_DB, d, BASE_INPUT, FAKE_PUBLISHER);

    expect(result).toEqual({ ok: false, error: 'brand_not_found' });
    expect(d.promoteNodesToPost).not.toHaveBeenCalled();
  });

  it('rifiuta un nodo senza output, senza creare il post', async () => {
    const d = deps({
      promoteNodesToPost: vi.fn().mockRejectedValue(new Error('node_not_found: node-1'))
    });

    const result = await createPostFromNodes(FAKE_DB, d, BASE_INPUT, FAKE_PUBLISHER);

    expect(result).toEqual({ ok: false, error: 'node_not_found', message: 'node_not_found: node-1' });
  });
});
