import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { env } from '$env/dynamic/private';
import { toAiTools, type McpListedTool } from './mcp-tools';
import type { Tool } from 'ai';

const DEFAULT_MCP_URL = 'https://mcp.anomalia.so/mcp';

export function brandMcpUrl(): string {
	return env.BRAND_MCP_URL?.trim() || DEFAULT_MCP_URL;
}

export type BrandMcpSession = {
	tools: Record<string, Tool>;
	close: () => Promise<void>;
};

/**
 * I tool del brand arrivano dal server MCP remoto, autenticato col JWT dell'utente — lo stesso
 * che il CLI e Claude Desktop presentano. Il token resta sul server: il browser parla solo con
 * la nostra rotta, mai con mcp.anomalia.so.
 *
 * Il token viaggia in `requestInit` invece che con un `authProvider`: l'OAuth dance serve a chi
 * il token deve ottenerlo, e qui la sessione ce l'ha già in mano.
 */
export async function openBrandMcp(accessToken: string): Promise<BrandMcpSession> {
	const transport = new StreamableHTTPClientTransport(new URL(brandMcpUrl()), {
		requestInit: { headers: { Authorization: `Bearer ${accessToken}` } }
	});

	const client = new Client({ name: 'anomalia-brand-chat', version: '1.0.0' });
	await client.connect(transport);

	const listed = await client.listTools();

	return {
		tools: toAiTools(listed.tools as McpListedTool[], async (name, args) =>
			client.callTool({ name, arguments: args })
		),
		close: () => client.close()
	};
}
