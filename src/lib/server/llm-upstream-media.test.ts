import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({
	env: {} as Record<string, string | undefined>,
	generateText: vi.fn(async () => ({ text: 'ciao', usage: {} }))
}));

vi.mock('$env/dynamic/private', () => ({ env: M.env }));
vi.mock('$lib/server/chat-model-catalog', () => ({ defaultChatModelId: () => null }));
vi.mock('$lib/server/ai-log', () => ({
	logAiCall: vi.fn(),
	extractSdkUsage: () => ({}),
	noteLlmCost: vi.fn()
}));
vi.mock('ai', async () => ({
	...(await vi.importActual<typeof import('ai')>('ai')),
	generateText: M.generateText
}));

describe('llmText manda le immagini a monte al modello, via generateText', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		for (const k of Object.keys(M.env)) delete M.env[k];
		Object.assign(M.env, { LLM_API_KEY: 'k', LLM_DEFAULT_MODEL: 'google/gemini-3.7-flash' });
	});

	function messageContent() {
		return M.generateText.mock.calls[0][0].messages[0].content as Array<Record<string, unknown>>;
	}

	it('un\'immagine a monte entra come URL, non scaricata in byte', async () => {
		const { llmText } = await import('./llm');
		await llmText({ prompt: 'descrivi questa immagine', upstream: { imageUrls: ['https://cdn/img.png'] } });

		const content = messageContent();
		const imagePart = content.find((p) => p.type === 'file' && p.mediaType === 'image');
		expect(imagePart).toMatchObject({ type: 'file', data: new URL('https://cdn/img.png'), mediaType: 'image' });
	});

	it('più immagini a monte entrano tutte, nello stesso ordine', async () => {
		const { llmText } = await import('./llm');
		await llmText({
			prompt: 'confronta queste immagini',
			upstream: { imageUrls: ['https://cdn/a.png', 'https://cdn/b.png'] }
		});

		const images = messageContent().filter((p) => p.type === 'file' && p.mediaType === 'image');
		expect(images).toEqual([
			{ type: 'file', data: new URL('https://cdn/a.png'), mediaType: 'image' },
			{ type: 'file', data: new URL('https://cdn/b.png'), mediaType: 'image' }
		]);
	});

	it('senza upstream, il contenuto resta solo testo — nessuna regressione sul caso comune', async () => {
		const { llmText } = await import('./llm');
		await llmText({ prompt: 'scrivi qualcosa' });

		expect(messageContent()).toEqual([{ type: 'text', text: 'scrivi qualcosa' }]);
	});
});
