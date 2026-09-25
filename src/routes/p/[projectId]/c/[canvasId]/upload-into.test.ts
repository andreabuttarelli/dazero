import { beforeEach, describe, expect, it, vi } from 'vitest';

const gateOrgAiActionForForm = vi.fn();
const listMemberships = vi.fn();
const findCanvasForUser = vi.fn();
const runGenNode = vi.fn();
const registerCanvasUpload = vi.fn();
const registerUploadedAsset = vi.fn();

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
vi.mock('$lib/server/canvas/upload', () => ({
	registerCanvasUpload: (...a: unknown[]) => registerCanvasUpload(...a),
	registerUploadedAsset: (...a: unknown[]) => registerUploadedAsset(...a),
	UploadError: class extends Error {}
}));
vi.mock('$lib/server/canvas/loop', () => ({ planLoop: vi.fn(), runLoop: vi.fn() }));
vi.mock('$lib/server/canvas/duplicate', () => ({ duplicateNodes: vi.fn() }));
vi.mock('$lib/server/canvas/undo', () => ({ undoGesture: vi.fn() }));
vi.mock('$lib/server/canvas/products-sync', () => ({ syncProductsNode: vi.fn() }));
vi.mock('$lib/server/canvas/social-feed-sync', () => ({ syncSocialFeedNode: vi.fn() }));
vi.mock('$lib/canvas/doc-node', async (importOriginal) => ({ ...(await importOriginal<object>()), mintShareToken: vi.fn() }));
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

const FILE = {
	path: 'org-1/project-1/x-effects.png', file_name: 'effects.png', mime_type: 'image/png', bytes: '10'
};

describe('actions.upload', () => {
	it('places a node on the canvas by default', async () => {
		registerCanvasUpload.mockResolvedValue({ asset: { id: 'a1' }, node: { id: 'n1' } });

		await actions.upload(fakeEvent(FILE));

		expect(registerCanvasUpload).toHaveBeenCalled();
		expect(registerUploadedAsset).not.toHaveBeenCalled();
	});

	it('only registers the asset when the file goes to the library', async () => {
		registerUploadedAsset.mockResolvedValue({ asset: { id: 'a1' }, kind: 'image' });

		const result = await actions.upload(fakeEvent({ ...FILE, into: 'library' }));

		expect(registerCanvasUpload).not.toHaveBeenCalled();
		expect(registerUploadedAsset).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			orgId: 'org-1', projectId: 'project-1', path: FILE.path
		}));
		expect(result).toEqual({ asset: { id: 'a1' } });
	});
});
