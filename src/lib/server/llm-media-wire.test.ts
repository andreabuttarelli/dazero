import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * IL DIFETTO PAGATO, 2026-09-24. Un nodo video collegato a un nodo testo su un modello Gemini
 * falliva con `'file part media type video/mp4' functionality not supported.`: il provider
 * chat-completions di `@ai-sdk/openai` rifiuta ogni `FilePart` il cui top-level media type non è
 * `image`, `audio` (solo byte) o `application/pdf` — video sempre, audio via URL sempre.
 * `llm-upstream-media.test.ts` mockava `generateText` e non lo vedeva: nessuna richiesta vera
 * usciva mai verso il gateway. Questo test sta al confine HTTP, come OpenRouter lo riceve
 * davvero — `video_url`/`input_audio`, non `file`.
 */
const M = vi.hoisted(() => ({
	env: {} as Record<string, string | undefined>,
	fetch: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: M.env }));
vi.mock('$lib/server/chat-model-catalog', () => ({ defaultChatModelId: () => null }));
vi.mock('$lib/server/ai-log', () => ({
	logAiCall: vi.fn(),
	extractSdkUsage: () => ({}),
	noteLlmCost: vi.fn()
}));

function okResponse(body: Record<string, unknown>) {
	return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('llmText manda video/audio a monte come OpenRouter li accetta', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		for (const k of Object.keys(M.env)) delete M.env[k];
		Object.assign(M.env, { LLM_API_KEY: 'k', LLM_DEFAULT_MODEL: 'google/gemini-3.7-flash' });
		M.fetch.mockResolvedValue(
			okResponse({ choices: [{ message: { content: 'ciao' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
		);
		vi.stubGlobal('fetch', M.fetch);
	});

	function sentBody(calls: Array<unknown[]> = M.fetch.mock.calls): Record<string, unknown> {
		const call = calls.find((c) => typeof (c[1] as RequestInit | undefined)?.body === 'string')!;
		return JSON.parse((call[1] as RequestInit).body as string);
	}

	it('un video a monte esce come video_url, non come file', async () => {
		const { llmText } = await import('./llm');
		await llmText({ prompt: 'riassumi questo video', upstream: { videoUrls: ['https://cdn/clip.mp4'] } });

		const body = sentBody();
		const messages = body.messages as Array<{ role: string; content: unknown }>;
		const content = messages.find((m) => m.role === 'user')?.content as Array<Record<string, unknown>>;
		expect(content).toContainEqual({ type: 'video_url', video_url: { url: 'https://cdn/clip.mp4' } });
		expect(content.some((p) => p.type === 'file')).toBe(false);
	});

	it('un audio a monte esce come input_audio con dati base64, non come URL grezzo', async () => {
		const combinedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (typeof input === 'string' && input.includes('cdn/voice.mp3')) {
				return new Response(new Uint8Array([1, 2, 3]).buffer, {
					status: 200,
					headers: { 'content-type': 'audio/mpeg' }
				});
			}
			return M.fetch(input, init);
		});
		vi.stubGlobal('fetch', combinedFetch);

		const { llmText } = await import('./llm');
		await llmText({ prompt: 'trascrivi questo audio', upstream: { audioUrls: ['https://cdn/voice.mp3'] } });

		const body = sentBody(combinedFetch.mock.calls);
		const messages = body.messages as Array<{ role: string; content: unknown }>;
		const content = messages.find((m) => m.role === 'user')?.content as Array<Record<string, unknown>>;
		const audioPart = content.find((p) => p.type === 'input_audio') as
			| { input_audio: { data: string; format: string } }
			| undefined;
		expect(audioPart).toBeDefined();
		expect(audioPart!.input_audio.format).toBe('mp3');
		expect(typeof audioPart!.input_audio.data).toBe('string');
	});
});
