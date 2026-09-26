import { describe, expect, it } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';
import { listNodeSocialPosts, upsertNodeSocialPosts, deleteNodeSocialPosts } from './social-posts';
import type { NormalizedPost } from '$lib/server/scrapecreators';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const NODE = '33333333-3333-3333-3333-333333333333';

const post: NormalizedPost = {
  externalId: 'abc123',
  url: 'https://instagram.com/p/abc123',
  content: 'hello world',
  mediaType: 'image',
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  publishedAt: '2026-09-20T10:00:00.000Z',
  metrics: { likes: 10, comments: 2 }
};

describe('upsertNodeSocialPosts', () => {
  it('non scrive niente quando il feed è vuoto', async () => {
    const { db, calls } = fakeDb({});
    const synced = await upsertNodeSocialPosts(db, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'instagram',
      handle: 'brand',
      posts: []
    });
    expect(synced).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('scrive con upsert su (node_id, external_id), mai un insert puro', async () => {
    const { db, calls } = fakeDb({});
    const synced = await upsertNodeSocialPosts(db, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'instagram',
      handle: 'brand',
      posts: [post]
    });

    expect(synced).toBe(1);
    const call = calls.find((c) => c.table === 'social_posts' && c.op === 'upsert');
    expect(call).toBeDefined();
    const rows = call!.payload as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      org_id: ORG,
      project_id: PROJECT,
      node_id: NODE,
      platform: 'instagram',
      external_id: 'abc123',
      caption: 'hello world',
      permalink: 'https://instagram.com/p/abc123',
      posted_at: '2026-09-20T10:00:00.000Z'
    });
  });

  it('lo stesso post ri-sincronizzato resta una riga sola nel payload di questo giro', async () => {
    const { db, calls } = fakeDb({});
    await upsertNodeSocialPosts(db, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'instagram',
      handle: 'brand',
      posts: [post, post]
    });

    const call = calls.find((c) => c.table === 'social_posts' && c.op === 'upsert')!;
    const rows = call.payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.external_id)).size).toBe(1);
  });
});

describe('listNodeSocialPosts', () => {
  it('filtra per org_id e node_id', async () => {
    const { db, calls } = fakeDb({
      social_posts: [
        {
          id: 's1',
          node_id: NODE,
          project_id: PROJECT,
          platform: 'instagram',
          external_id: 'abc123',
          handle: 'brand',
          caption: 'hello',
          media: {},
          metrics: {},
          permalink: null,
          posted_at: null,
          fetched_at: '2026-09-22T00:00:00Z'
        }
      ]
    });

    const out = await listNodeSocialPosts(db, { orgId: ORG, nodeId: NODE });
    expect(out).toHaveLength(1);

    const call = calls.find((c) => c.table === 'social_posts' && c.op === 'select')!;
    const filters = Object.fromEntries(call.filters);
    expect(filters.org_id).toBe(ORG);
    expect(filters.node_id).toBe(NODE);
  });
});

describe('deleteNodeSocialPosts', () => {
  it('cancella per org_id e node_id insieme', async () => {
    const { db, calls } = fakeDb({});
    await deleteNodeSocialPosts(db, { orgId: ORG, nodeId: NODE });
    const call = calls.find((c) => c.table === 'social_posts' && c.op === 'delete')!;
    const filters = Object.fromEntries(call.filters);
    expect(filters.org_id).toBe(ORG);
    expect(filters.node_id).toBe(NODE);
  });
});
