import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `gateOrgAiAction` (rotta API) restituisce una `Response` — una form action non può
 * restituirne una a SvelteKit ("Data returned from action … is not serializable"), e su un'org a
 * saldo zero l'utente vedeva un errore generico al posto di "crediti finiti". La prova è qui:
 * un'org senza crediti, l'azione `run`, un `fail(402, …)` leggibile — mai una `Response` nuda.
 */

const gateOrgAiActionForForm = vi.fn();
const listMemberships = vi.fn();
const findCanvasForUser = vi.fn();
const runGenNode = vi.fn();

vi.mock('$lib/server/cli-auth', () => ({
	gateOrgAiActionForForm: (...a: unknown[]) => gateOrgAiActionForForm(...a)
}));
vi.mock('$lib/server/repos/orgs', () => ({
	listMemberships: (...a: unknown[]) => listMemberships(...a)
}));
vi.mock('$lib/server/canvas/lookup', () => ({
	findCanvasForUser: (...a: unknown[]) => findCanvasForUser(...a)
}));
vi.mock('$lib/server/canvas/generate', () => ({
	runGenNode: (...a: unknown[]) => runGenNode(...a),
	runsOf: vi.fn()
}));
vi.mock('$lib/server/canvas/upload', () => ({ registerCanvasUpload: vi.fn(), UploadError: class extends Error {} }));
vi.mock('$lib/server/canvas/loop', () => ({ planLoop: vi.fn(), runLoop: vi.fn() }));
vi.mock('$lib/server/canvas/duplicate', () => ({ duplicateNodes: vi.fn() }));
vi.mock('$lib/server/canvas/undo', () => ({ undoGesture: vi.fn() }));
vi.mock('$lib/server/canvas/products-sync', () => ({ syncProductsNode: vi.fn() }));
vi.mock('$lib/server/canvas/social-feed-sync', () => ({ syncSocialFeedNode: vi.fn() }));
vi.mock('$lib/canvas/doc-node', () => ({ mintShareToken: vi.fn() }));
vi.mock('$lib/server/repos/doc-share', () => ({ clearDocShare: vi.fn(), setDocShare: vi.fn() }));
vi.mock('$lib/server/canvas-catalogue', () => ({ canvasModelCatalogue: vi.fn() }));
vi.mock('$lib/server/repos/products', () => ({ listNodeProducts: vi.fn() }));
vi.mock('$lib/server/repos/social-posts', () => ({ listNodeSocialPosts: vi.fn() }));
vi.mock('$lib/server/repos/influencers', () => ({
	getInfluencer: vi.fn(),
	listInfluencerViewsByIds: vi.fn(),
	signInfluencerViewFiles: vi.fn()
}));

import { actions } from './+page.server';

const SCOPE = { orgId: 'org-1', canvasId: 'canvas-1' };

function fakeEvent(formEntries: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(formEntries)) fd.set(k, v);

	return {
		request: { formData: () => Promise.resolve(fd) },
		params: { canvasId: 'canvas-1' },
		locals: {
			safeGetSession: async () => ({ session: {}, user: { id: 'user-1' } }),
			db: async () => ({})
		}
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	listMemberships.mockResolvedValue([]);
	findCanvasForUser.mockResolvedValue({ orgId: SCOPE.orgId, canvas: { projectId: 'project-1' } });
});

describe('actions.run on a zero-credit org', () => {
	it('returns a readable fail(402), never a raw Response, and never calls runGenNode', async () => {
		gateOrgAiActionForForm.mockResolvedValue({
			status: 402,
			data: { error: 'credits_exhausted', message: 'AI credits are exhausted for this billing period. Buy more to continue.' }
		});

		const result = await actions.run(
			fakeEvent({ node_id: 'node-1', medium: 'text', prompt: 'hi', model: 'x', version: '1', params: '{}' })
		);

		expect(result).not.toBeInstanceOf(Response);
		expect((result as { status: number }).status).toBe(402);
		expect((result as { data: { error: string } }).data.error).toBe('credits_exhausted');
		expect((result as { data: { message: string } }).data.message).toContain('credits');
		expect(runGenNode).not.toHaveBeenCalled();
	});
});
