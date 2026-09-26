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

/**
 * I TRE CHE NON POSSONO CADERE, e cadevano.
 *
 * Il taglio era posizionale: il server ne elenca ~77, il tetto ne tiene 40, e quali sopravvivono
 * lo decideva l'ordine di `tools/list`. `query`, `insert_row` e `update_row` finivano oltre la
 * soglia — con l'effetto che l'agente diceva, in buona fede, di non avere modo di leggere il
 * database. Per la tela era fatale: le sue tabelle non hanno un tool dedicato apposta, perché
 * questi tre bastano.
 *
 * Sono i soli privilegiati perché sono i soli GENERICI: ogni altro tool copre una cosa sola, e
 * perderlo toglie quella; perdere questi toglie tutto ciò che non ha un verbo suo.
 */
const ALWAYS_KEEP = ['query', 'insert_row', 'update_row'] as const;

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
 * mcp.feega.app compare nella chat senza toccare questo repo. Per questo il modulo non conosce
 * nessun nome di tool.
 *
 * Un errore torna al modello come TESTO invece di far cadere il turno: «brand not found» è
 * un'informazione su cui il modello può correggere il tiro, mentre un'eccezione butta via anche
 * la parte di risposta già scritta.
 */
export function toAiTools(listed: McpListedTool[], call: McpCall): Record<string, Tool> {
	const tools: Record<string, Tool> = {};

	// I generici davanti, poi gli altri nell'ordine del server: il tetto resta quello: quel che
	// cambia è CHI perde il posto, che non può più essere deciso dal caso.
	const keep = new Set<string>(ALWAYS_KEEP);
	const ordered = [
		...listed.filter((t) => keep.has(t.name)),
		...listed.filter((t) => !keep.has(t.name))
	];

	for (const listedTool of ordered.slice(0, MCP_TOOL_LIMIT)) {
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
