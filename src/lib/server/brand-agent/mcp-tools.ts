import { jsonSchema, tool, type Tool } from 'ai';

export type McpListedTool = {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
};

export type McpCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Ogni tool dichiarato viaggia nel prompt di OGNI turno: il catalogo intero è un conto che si
 * paga a ogni messaggio, per sempre. Il tetto tiene il prompt a una misura nota mentre il server
 * cresce.
 */
export const MCP_TOOL_LIMIT = 40;

const OPEN_OBJECT = { type: 'object', properties: {}, additionalProperties: true } as const;

function textOf(result: unknown): string {
	const content = (result as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
	if (!Array.isArray(content)) return JSON.stringify(result ?? null);

	const text = content
		.filter((part) => part?.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text)
		.join('\n');

	return text || JSON.stringify(result ?? null);
}

/**
 * I tool del brand vengono dal server MCP, non da un elenco scritto qui: un tool aggiunto su
 * mcp.anomalia.so compare nella chat senza toccare questo repo. Per questo il modulo non conosce
 * nessun nome di tool.
 *
 * Un errore torna al modello come TESTO invece di far cadere il turno: «brand not found» è
 * un'informazione su cui il modello può correggere il tiro, mentre un'eccezione butta via anche
 * la parte di risposta già scritta.
 */
export function toAiTools(listed: McpListedTool[], call: McpCall): Record<string, Tool> {
	const tools: Record<string, Tool> = {};

	for (const listedTool of listed.slice(0, MCP_TOOL_LIMIT)) {
		tools[listedTool.name] = tool({
			description: listedTool.description ?? listedTool.name,
			inputSchema: jsonSchema((listedTool.inputSchema ?? OPEN_OBJECT) as never),
			execute: async (args: unknown) => {
				try {
					return textOf(await call(listedTool.name, (args ?? {}) as Record<string, unknown>));
				} catch (e) {
					return `Tool ${listedTool.name} failed: ${e instanceof Error ? e.message : String(e)}`;
				}
			}
		});
	}

	return tools;
}
