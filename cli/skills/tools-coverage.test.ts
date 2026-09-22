import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const CLI = fileURLToPath(new URL('../', import.meta.url));
const MCP_TOOLS = join(CLI, 'mcp', 'tools');
const SKILL = join(CLI, 'skills', 'dazero', 'SKILL.md');
const REFERENCE = join(CLI, 'skills', 'dazero', 'references', 'tools.md');

/**
 * La superficie MCP reale non nasce da un registro: e' cablata a mano in
 * `cli/mcp/tools/{posts,ads,org-data,nodes}.ts`, ognuno un `server.registerTool('nome', ...)`.
 * Un estrattore che leggesse un registro dichiarativo (`BRAND_ENDPOINTS` e simili) mentirebbe: quel
 * registro serve alle rotte REST brand-scoped che il CLI chiama ancora, non a `tools/list`.
 */
function registeredTools(): Set<string> {
  const source = readdirSync(MCP_TOOLS)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => readFileSync(join(MCP_TOOLS, file), 'utf8'))
    .join('\n');

  return new Set([...source.matchAll(/registerTool\(\s*'([a-z][a-z0-9_]*)'/g)].map((m) => m[1]));
}

function toolsNamedIn(path: string): Set<string> {
  const text = readFileSync(path, 'utf8');
  return new Set([...text.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]));
}

const MIN_REGISTERED_TOOLS = 10;

describe('la skill sta al passo con i tool che esistono davvero', () => {
  test("l'estrattore trova ancora qualcosa", () => {
    expect(registeredTools().size).toBeGreaterThanOrEqual(MIN_REGISTERED_TOOLS);
  });

  test('ogni tool registrato e nominato in SKILL.md', () => {
    const named = toolsNamedIn(SKILL);
    const missing = [...registeredTools()].filter((tool) => !named.has(tool)).sort();
    expect(missing).toEqual([]);
  });

  test('ogni tool registrato e nominato in references/tools.md', () => {
    const named = toolsNamedIn(REFERENCE);
    const missing = [...registeredTools()].filter((tool) => !named.has(tool)).sort();
    expect(missing).toEqual([]);
  });
});
