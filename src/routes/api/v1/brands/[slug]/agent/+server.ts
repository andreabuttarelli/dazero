import { json, error as httpError } from '@sveltejs/kit';
import { streamText, type ModelMessage } from 'ai';
import { llmLanguageModel, llmModelForPicker } from '$lib/server/llm';
import { extractSdkUsage, logAiCall } from '$lib/server/ai-log';
import { loadBrandForUser, gateAiAction } from '$lib/server/cli-auth';
import { openBrandMcp } from '$lib/server/brand-agent/mcp-client';
import { openBrandThread } from '$lib/server/brand-agent/thread';
import { brandAgentSystemPrompt } from '$lib/server/brand-agent/system-prompt';
import { loadTurns, saveTurn } from '$lib/server/brand-agent/turns';
import type { RequestHandler } from './$types';

// Un turno che usa i tool del brand legge, scrive e rilegge: sta nei minuti, non nei secondi.
// Gli scaglioni di maxDuration su Vercel sono tre (300, 800, 1800) e ognuno in più emette una
// funzione serverless intera: si resta su 300, che è quello che le altre rotte di chat già usano.
export const config = { maxDuration: 300 };

const MAX_STEPS = 12;

export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session?.access_token || !user) {
		return json({ error: 'unauthenticated' }, { status: 401 });
	}

	const { brand, error: brandError } = await loadBrandForUser(locals.supabase, params.slug);
	if (brandError) return brandError;

	const gated = await gateAiAction(brand, undefined);
	if (gated) return gated;

	const { message } = (await request.json()) as { message?: string };
	const text = message?.trim();
	if (!text) return json({ error: 'empty_message' }, { status: 400 });

	const threadId = await openBrandThread(locals.supabase, brand.id, user.id);
	const history = await loadTurns(locals.supabase, threadId);

	await saveTurn(locals.supabase, {
		threadId,
		brandId: brand.id,
		userId: user.id,
		role: 'user',
		content: text
	});

	const mcp = await openBrandMcp(session.access_token);
	const model = llmModelForPicker(null);
	const t0 = Date.now();

	const result = streamText({
		model: llmLanguageModel(model),
		system: brandAgentSystemPrompt(brand),
		allowSystemInMessages: true,
		messages: [...history, { role: 'user', content: text }] as ModelMessage[],
		tools: mcp.tools,
		stopWhen: [({ steps }) => steps.length >= MAX_STEPS],
		onFinish: async ({ text: answer, totalUsage }) => {
			// La chiusura e il salvataggio stanno QUI perché `streamText` torna subito: chiuderli
			// dopo il return taglierebbe i tool a metà turno.
			await mcp.close().catch(() => {});

			await saveTurn(locals.supabase, {
				threadId,
				brandId: brand.id,
				userId: user.id,
				role: 'assistant',
				content: answer,
				model,
				durationMs: Date.now() - t0
			}).catch((e) => console.warn('[brand-agent] turn not saved:', e));

			logAiCall({
				label: 'brand-agent',
				provider: 'llm',
				model,
				ms: Date.now() - t0,
				ok: true,
				brandId: brand.id,
				userId: user.id,
				threadId,
				...extractSdkUsage(totalUsage)
			});
		}
	});

	return result.toUIMessageStreamResponse({ sendReasoning: false });
};

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

	const { brand, error: brandError } = await loadBrandForUser(locals.supabase, params.slug);
	if (brandError) return brandError;

	const threadId = await openBrandThread(locals.supabase, brand.id, user.id);

	return json({ threadId, messages: await loadTurns(locals.supabase, threadId) });
};
