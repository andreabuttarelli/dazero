import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LA STESSA PORTA DEL LOOP, per un agente MCP. `runLoop`/`planLoop` sono lo stesso motore che la
 * tela chiamerà per il pulsante «Genera in loop» — nessuna copia. Questi test tengono ferme le
 * cose che un secondo percorso dimenticherebbe: il cancello crediti dell'org, `writeAllowed`, e
 * che sopra 50 combinazioni serve `confirm: true` esplicito prima di girare.
 */

const resolveOrgCaller = vi.fn();
const gateOrgAiAction = vi.fn();
const planLoop = vi.fn();
const runLoop = vi.fn();
const findNode = vi.fn();

vi.mock('$lib/server/org-data/auth', () => ({
  resolveOrgCaller: (...args: unknown[]) => resolveOrgCaller(...args)
}));
vi.mock('$lib/server/cli-auth', () => ({
  gateOrgAiAction: (...args: unknown[]) => gateOrgAiAction(...args)
}));
vi.mock('$lib/server/canvas/loop', () => ({
  planLoop: (...args: unknown[]) => planLoop(...args),
  runLoop: (...args: unknown[]) => runLoop(...args)
}));
vi.mock('$lib/server/repos/canvas', () => ({
  findNode: (...args: unknown[]) => findNode(...args)
}));

import { GET, POST } from './+server';

const ORG = 'org-1';
const NODE = 'node-1';
const USER = 'user-1';
const PROJECT = 'project-1';
const CANVAS = 'canvas-1';

function call(handler: typeof GET | typeof POST, id: string, body?: unknown) {
  const url = new URL(`https://dazero.test/api/v1/org/nodes/${id}/loop`);
  return (handler as (event: unknown) => Promise<Response>)({
    request: new Request(url, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer token' },
      body: body ? JSON.stringify(body) : undefined
    }),
    params: { id },
    url
  }).then(async (res) => ({ res, body: await res.json() }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveOrgCaller.mockResolvedValue({
    caller: { db: {}, orgId: ORG, userId: USER, writeAllowed: true, apiKeyId: 'key-1' }
  });
  gateOrgAiAction.mockResolvedValue(undefined);
  findNode.mockResolvedValue({ id: NODE, projectId: PROJECT, canvasId: CANVAS, type: 'image', version: 1 });
});

describe('GET /api/v1/org/nodes/:id/loop — il preventivo, mai spende', () => {
  it('torna il piano di planLoop senza gate crediti (un preventivo non spende)', async () => {
    planLoop.mockResolvedValue({
      node: { id: NODE, projectId: PROJECT, canvasId: CANVAS },
      combinations: [{ label: '', values: {} }],
      shortestWins: null,
      rejectedAxes: [],
      safety: { verdict: 'run', count: 1 },
      cost: { perRun: 10, total: 10 }
    });

    const { res, body } = await call(GET, NODE);

    expect(res.status).toBe(200);
    expect(body.safety.verdict).toBe('run');
    expect(gateOrgAiAction).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/org/nodes/:id/loop — esegue, con lo stesso motore', () => {
  it('gates on org credits before ever calling runLoop', async () => {
    gateOrgAiAction.mockResolvedValue(new Response(JSON.stringify({ error: 'credits_exhausted' }), { status: 402 }));

    const { res } = await call(POST, NODE, { confirm: true });

    expect(res.status).toBe(402);
    expect(runLoop).not.toHaveBeenCalled();
  });

  it('passa confirm come confirmed a runLoop', async () => {
    runLoop.mockResolvedValue({ kind: 'ran', results: [], outputListNodeId: 'list-1', cancelled: false });

    const { res, body } = await call(POST, NODE, { confirm: true });

    expect(res.status).toBe(200);
    expect(runLoop).toHaveBeenCalledWith({}, expect.objectContaining({ orgId: ORG, nodeId: NODE, userId: USER, confirmed: true }));
    expect(body.kind).toBe('ran');
  });

  it('needs_confirmation torna 200 con il conteggio, non un errore', async () => {
    runLoop.mockResolvedValue({ kind: 'needs_confirmation', count: 80, cost: { perRun: 10, total: 800 } });

    const { res, body } = await call(POST, NODE, {});

    expect(res.status).toBe(200);
    expect(body.kind).toBe('needs_confirmation');
    expect(body.count).toBe(80);
  });

  it('refused torna 400', async () => {
    runLoop.mockResolvedValue({ kind: 'refused', error: 'troppe combinazioni (2000): dividi il loop' });

    const { res, body } = await call(POST, NODE, { confirm: true });

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/dividi/);
  });

  it('rejects a write when the API key is read-only', async () => {
    resolveOrgCaller.mockResolvedValue({
      caller: { db: {}, orgId: ORG, userId: USER, writeAllowed: false, apiKeyId: 'key-1' }
    });

    const { res, body } = await call(POST, NODE, { confirm: true });

    expect(res.status).toBe(403);
    expect(body.error).toBe('api_key_read_only');
    expect(runLoop).not.toHaveBeenCalled();
  });
});
