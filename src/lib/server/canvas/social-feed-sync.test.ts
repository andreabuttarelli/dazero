import { describe, expect, it, vi, beforeEach } from 'vitest';

const { fetchSocialFeed, upsertNodeSocialPosts } = vi.hoisted(() => ({
  fetchSocialFeed: vi.fn(),
  upsertNodeSocialPosts: vi.fn()
}));

vi.mock('$lib/server/social-feed-fetch', () => ({ fetchSocialFeed }));
vi.mock('$lib/server/repos/social-posts', () => ({ upsertNodeSocialPosts }));

import { syncSocialFeedNode } from './social-feed-sync';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const NODE = '33333333-3333-3333-3333-333333333333';

beforeEach(() => vi.clearAllMocks());

describe('syncSocialFeedNode', () => {
  it('un handle che non esiste torna l\'errore leggibile e non scrive niente', async () => {
    fetchSocialFeed.mockResolvedValue({ ok: false, error: 'no_posts: no public posts found for @ghost on instagram — check the handle' });

    const out = await syncSocialFeedNode(null as never, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'instagram',
      handle: 'ghost',
      limit: 20
    });

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/no_posts/);
    expect(upsertNodeSocialPosts).not.toHaveBeenCalled();
  });

  it('quando il feed riesce, scrive col repository e torna quanti', async () => {
    fetchSocialFeed.mockResolvedValue({ ok: true, posts: [{ externalId: '1' }, { externalId: '2' }] });
    upsertNodeSocialPosts.mockResolvedValue(2);

    const out = await syncSocialFeedNode({} as never, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'instagram',
      handle: 'brand',
      limit: 20
    });

    expect(out).toEqual({ ok: true, synced: 2 });
  });
});
