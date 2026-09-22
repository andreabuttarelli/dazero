import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyPostEdits = vi.fn(async () => ({ error: null }));

vi.mock('$lib/server/cli-auth', () => ({
  authenticate: vi.fn(async () => ({
    supabase: fakeSupabase(),
    user: { id: 'u1' },
    apiKey: undefined,
    error: null
  })),
  loadBrandForUser: vi.fn(async () => ({ brand: { id: 'brand-1' }, error: null })),
  checkApiKeyWriteAccess: () => null
}));
vi.mock('$lib/server/post-editing', () => ({
  applyPostEdits: (...a: unknown[]) => applyPostEdits(...(a as [])),
  deletePostCancellingZernio: vi.fn(),
  reschedIfNeeded: async () => undefined
}));

function fakeSupabase() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: { id: 'p1' }, error: null })
  };
  return { from: () => q };
}

import { PUT } from './+server';

const put = (body: Record<string, unknown>): Promise<Response> =>
  (PUT as (e: unknown) => Promise<Response>)({
    request: new Request('https://example.test/api/v1/brands/demo/posts/p1', {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
    params: { slug: 'demo', id: 'p1' }
  });

beforeEach(() => vi.clearAllMocks());

describe('PUT /api/v1/brands/:slug/posts/:id', () => {
  it('risponde con quello che ha scritto, non con l’eco di quello che gli hai chiesto', async () => {
    const res = await put({ caption: 'ciao', inventato: 'x' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, patch: { caption: 'ciao' } });
  });

  it('senza nessun campo che sa applicare resta un 400', async () => {
    expect((await put({ inventato: 'x' })).status).toBe(400);
  });
});

describe('PUT /posts/:id — la versione che il chiamante ha letto', () => {
  it('passa `expected_updated_at` al guard invece di trattarlo come un campo da scrivere', async () => {
    await put({ caption: 'nuova', expected_updated_at: '2026-09-19T10:00:00Z' });

    const [, , patch, opts] = applyPostEdits.mock.calls[0] as unknown as [
      unknown,
      unknown,
      Record<string, unknown>,
      Record<string, unknown>
    ];
    expect(patch).not.toHaveProperty('expected_updated_at');
    expect(opts.expectedUpdatedAt).toBe('2026-09-19T10:00:00Z');
  });

  it('da solo non è una modifica: senza altri campi il post non si tocca', async () => {
    const res = await put({ expected_updated_at: '2026-09-19T10:00:00Z' });

    expect(res.status).toBe(400);
    expect(applyPostEdits).not.toHaveBeenCalled();
  });

  it('un conflitto è 409 e si chiama `stale_post`, non un 500 anonimo', async () => {
    applyPostEdits.mockResolvedValueOnce({
      error: { message: 'Post modificato da qualcun altro dopo la tua lettura' }
    } as never);

    const res = await put({ caption: 'nuova', expected_updated_at: '2026-09-19T10:00:00Z' });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('stale_post');
  });
});
