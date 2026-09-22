import { streamText } from 'ai';
import { isHeavyProductionAsk } from '$lib/server/ai-model';
import { AgentToolLog, applyStewardPrepareStep, createAgentSteward } from '$lib/server/agent-steward';
import { wrapAgentTools } from '$lib/server/agent-tools';

/**
 * PRIMO STEP DI UNA RICHIESTA DI PRODUZIONE: UNO STRUMENTO, NON UN PARAGRAFO.
 *
 * Misurato il 2026-08-22 su `chat_messages`, contando SOLO i turni che rispondono a una richiesta
 * di produzione: il 28.6% dei turni su grok-4-6 finisce con ZERO chiamate a strumento (su
 * gpt-5-6-luna: 0%). La mediana è la stessa (6 chiamate): un turno su quattro legge il brief e
 * chiude a parole — «dimmi quale tema» — lasciando il lavoro non fatto.
 *
 * Il vincolo sta nell'SDK (`toolChoice: 'required'` al primo step), non in una riga di prompt
 * che è solo un consiglio. Vincolato due volte, perché forzare uno strumento dove non serve è
 * peggio del difetto che ripara: solo la chat (`surface: 'chat'`), solo su una richiesta di
 * PRODUZIONE (`isHeavyProductionAsk`, regex it/en, zero chiamate modello), e mai quando l'utente
 * ha detto di NO — «non fare alcun post» ha le stesse parole di «fai un post», quindi il filtro
 * lascia `generate_image` fra i candidati e il modello sceglieva proprio quello prima che la
 * negazione fosse guardata a monte del triage.
 *
 * `ask_user_questions` è tolto dallo step forzato: è in `stopWhen`, quindi chiuderebbe il turno —
 * l'unico modo di obbedire al `required` senza fare niente.
 */
const FORCED_STEP_EXCLUDE = new Set(['ask_user_questions']);

/**
 * CHI ACCETTA UN `tool_choice` DIVERSO DA `auto`. `z-ai/glm-5.3-flash` su openrouter risponde 400
 * «Tool choice must be auto» e il turno muore prima del primo step. L'elenco dice chi lo
 * SUPPORTA e non chi lo rifiuta: non forzare lascia un turno recuperabile, forzare dove non si
 * può uccide il turno intero. `grok` è l'unico su cui il difetto sia stato misurato (28.6%
 * sopra).
 */
const FORCED_TOOL_CHOICE_MODELS = [/grok/i];

function acceptsForcedToolChoice(model: string | null | undefined): boolean {
	const id = model?.trim();
	if (!id) return false;
	return FORCED_TOOL_CHOICE_MODELS.some((re) => re.test(id));
}

function lastUserText(messages: unknown): string {
	if (!Array.isArray(messages)) return '';
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i] as { role?: string; content?: unknown } | undefined;
		if (m?.role !== 'user') continue;
		if (typeof m.content === 'string') return m.content;
		if (Array.isArray(m.content)) {
			return (m.content as Array<{ type?: string; text?: string }>)
				.map((part) => (part?.type === 'text' ? (part.text ?? '') : ''))
				.join(' ');
		}
		return '';
	}
	return '';
}

export function forcedFirstStepTools(
	meta: { surface?: string; model?: string | null },
	messages: unknown,
	toolNames: string[]
): string[] {
	if (meta.surface !== 'chat') return [];
	if (!acceptsForcedToolChoice(meta.model)) return [];
	if (!isHeavyProductionAsk(lastUserText(messages))) return [];
	return toolNames.filter((n) => !FORCED_STEP_EXCLUDE.has(n));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOpts = Record<string, any>;

/**
 * Agente batch con streaming: avvolge i tool con lo steward e forza il primo tool su una
 * richiesta di produzione in chat (vedi sopra). Nessuna sessione, nessuna persistenza — solo
 * comportamento del turno.
 */
export function streamAgentText(
	meta: { agent: string; surface?: 'chat' | 'batch'; model?: string | null },
	options: AnyOpts
): ReturnType<typeof streamText> {
	const log = new AgentToolLog(meta.agent);
	if (typeof options.system === 'string') log.setSystem(options.system);
	const origPrepare = options.prepareStep;
	const origSystem = typeof options.system === 'string' ? options.system : '';
	const toolNames = options.tools && typeof options.tools === 'object' ? Object.keys(options.tools) : [];
	const steward = createAgentSteward(log, toolNames);

	const next: AnyOpts = {
		...options,
		allowSystemInMessages: (options as { allowSystemInMessages?: boolean }).allowSystemInMessages ?? true,
		tools: wrapAgentTools(log, options.tools, steward.pipeline())
	};

	const forcedTools =
		options.toolChoice == null ? forcedFirstStepTools(meta, options.messages, toolNames) : [];

	const runPrepare = (prepared: unknown, stepNumber: number) => {
		const patched = applyStewardPrepareStep(log, steward, prepared as Record<string, unknown>, origSystem);
		const out = (patched ?? {}) as Record<string, unknown>;
		if (typeof out.system === 'string') log.setSystem(out.system);
		const forced =
			forcedTools.length && stepNumber === 0 && out.toolChoice == null
				? { ...out, toolChoice: 'required', activeTools: out.activeTools ?? forcedTools }
				: out;
		return forced;
	};

	next.prepareStep = (args: { stepNumber?: number }) => {
		const step = args?.stepNumber ?? 0;
		if (typeof origPrepare !== 'function') return runPrepare({}, step);
		const prepared = origPrepare(args);
		if (prepared && typeof prepared.then === 'function') {
			return prepared.then((p: unknown) => runPrepare(p, step));
		}
		return runPrepare(prepared, step);
	};

	const origStep = options.onStepFinish;
	next.onStepFinish = async (event: unknown) => {
		log.advanceStep();
		await origStep?.(event);
	};

	return streamText(next as Parameters<typeof streamText>[0]);
}
