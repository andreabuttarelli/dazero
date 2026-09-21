#!/usr/bin/env bun
/**
 * dazero MCP server (stdio).
 *
 * Auth is browser OAuth only — same flow as `dazero login`, same session file.
 * No static API tokens.
 *
 * Cursor / Claude Desktop example:
 * {
 *   "mcpServers": {
 *     "dazero": {
 *       "command": "bun",
 *       "args": ["run", "/absolute/path/to/dazero-cli/mcp/stdio.ts"]
 *     }
 *   }
 * }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnv } from '../lib/config.ts';
import { createdazeroMcpServer } from './server.ts';

await loadEnv();

const server = createdazeroMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('dazero MCP server running on stdio (OAuth session via login tool / dazero login)');
