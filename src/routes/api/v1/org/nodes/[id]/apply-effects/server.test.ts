import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LA STESSA RESA CHE L'EDITOR FA NEL BROWSER, PER UN AGENTE — `applyEffectsNode` è il motore,
 * questa rotta lo mette dietro auth come ogni altra `/org/nodes/:id/...`. Nessun gate crediti: non
 * c'è un provider da pagare.
 */

const resolveOrgCaller = vi.fn();
const applyEffectsNode = vi.fn();

vi.mock('$lib/server/org-data/auth', () => ({
  resolveOrgCaller: (...args: unknown[]) => resolveOrgCaller(...args)
}));
vi.mock('$lib/server/canvas/apply-effects', () => ({
  applyEffectsNode: (...args: unknown[]) => applyEffectsNode(...args)
}));

import { POST } from './+server';

const ORG = 'org-1';
const NODE = 'node-1';
const USER = 'user-1';

function call(id: string) {
  const url = new URL(`https://feega.test/api/v1/org/nodes/${id}/apply-effects`);
  return (POST as (event: unknown) => Promise<Response>)({
    request: new Request(url, { method: 'POST', headers: { authorization: 'Bearer token' } }),
    params: { id },
    url
  }).then(async (res) => ({ res, body: await res.json() }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveOrgCaller.mockResolvedValue({
    caller: { db: {}, orgId: ORG, userId: USER, writeAllowed: true, apiKeyId: 'key-1' }
  });
});

describe('POST /api/v1/org/nodes/:id/apply-effects', () => {
  it('renders the stack and returns the new asset', async () => {
    applyEffectsNode.mockResolvedValue({
      outcome: 'applied',
      asset: { id: 'asset-out', type: 'image', url: 'org-1/project-1/effects/x.png', width: 8, height: 8 }
    });

    const { res, body } = await call(NODE);

    expect(applyEffectsNode).toHaveBeenCalledWith({}, expect.objectContaining({ orgId: ORG, nodeId: NODE }));
    expect(res.status).toBe(200);
    expect(body.asset.id).toBe('asset-out');
  });

  it('maps refused to 400', async () => {
    applyEffectsNode.mockResolvedValue({ outcome: 'refused', error: 'sourceRefId mancante' });

    const { res, body } = await call(NODE);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/sourceRefId/);
  });

  it('maps conflict to 409', async () => {
    applyEffectsNode.mockResolvedValue({ outcome: 'conflict' });

    const { res, body } = await call(NODE);

    expect(res.status).toBe(409);
    expect(body.conflict).toBe(true);
  });

  it('rejects a write when the API key is read-only', async () => {
    resolveOrgCaller.mockResolvedValue({
      caller: { db: {}, orgId: ORG, userId: USER, writeAllowed: false, apiKeyId: 'key-1' }
    });

    const { res, body } = await call(NODE);

    expect(res.status).toBe(403);
    expect(body.error).toBe('api_key_read_only');
    expect(applyEffectsNode).not.toHaveBeenCalled();
  });
});
