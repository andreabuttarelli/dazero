#!/usr/bin/env bun
/**
 * feega MCP server (stdio).
 *
 * Auth is browser OAuth only — same flow as `feega login`, same session file.
 * No static API tokens.
 *
 * Cursor / Claude Desktop example:
 * {
 *   "mcpServers": {
 *     "feega": {
 *       "command": "bun",
 *       "args": ["run", "/absolute/path/to/feega-cli/mcp/stdio.ts"]
 *     }
 *   }
 * }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnv } from '../lib/config.ts';
import { createFeegaMcpServer } from './server.ts';

await loadEnv();

const server = createFeegaMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('feega MCP server running on stdio (OAuth session via login tool / feega login)');
