import type { AgentToolLog, AgentToolPipeline } from '$lib/server/agent-steward';

/**
 * Avvolge execute() di ogni tool con: una riga nel log dell'agente (di cui lo steward legge lo
 * snapshot) e gli hook before/after della pipeline (dove lo steward nega una chiamata). Nessuna
 * persistenza: il log vive in memoria per la durata del turno.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = { execute?: (...args: any[]) => any; [k: string]: unknown };

type WrappedTool<T> = T extends { execute: (...args: never[]) => unknown }
	? Omit<T, 'execute'> & { execute: (input: unknown, opts: unknown) => Promise<unknown> }
	: T;

export type WrappedTools<T> = T extends undefined ? T : { [K in keyof T]: WrappedTool<T[K]> };

export function wrapAgentTools<T extends Record<string, unknown> | undefined>(
	log: AgentToolLog,
	tools: T,
	pipeline?: AgentToolPipeline
): WrappedTools<T> {
	if (!tools) return tools as WrappedTools<T>;
	const out: Record<string, unknown> = {};
	for (const [name, raw] of Object.entries(tools)) {
		const tool = raw as AnyTool | undefined;
		if (!tool || typeof tool.execute !== 'function') {
			out[name] = raw;
			continue;
		}
		const original = tool.execute.bind(tool);
		out[name] = {
			...tool,
			execute: async (input: unknown, opts: unknown) => {
				log.recordCall(name);
				try {
					for (const hook of pipeline?.before ?? []) {
						const gate = await hook({ name, input });
						if (gate?.deny) {
							const denied = gate.result !== undefined ? gate.result : { error: gate.deny };
							log.recordResult(name, denied, true);
							return denied;
						}
					}
					let result = await original(input, opts);
					for (const hook of pipeline?.after ?? []) {
						const next = await hook({ name, input, output: result });
						if (next !== undefined) result = next;
					}
					log.recordResult(name, result, true);
					return result;
				} catch (e) {
					log.recordResult(name, undefined, false, e instanceof Error ? e.message : String(e));
					throw e;
				}
			}
		};
	}
	return out as WrappedTools<T>;
}
