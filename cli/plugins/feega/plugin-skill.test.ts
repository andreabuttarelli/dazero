import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CANONICAL = join(ROOT, 'skills', 'feega');
const PLUGIN = join(ROOT, 'plugins', 'feega', 'skills', 'feega');

function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

describe('plugin skill mirror', () => {
  test('plugins/feega/skills/feega matches skills/feega', () => {
    expect(existsSync(join(CANONICAL, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(PLUGIN, 'SKILL.md'))).toBe(true);
    const a = listFiles(CANONICAL);
    const b = listFiles(PLUGIN);
    expect(b).toEqual(a);
    for (const rel of a) {
      expect(readFileSync(join(PLUGIN, rel), 'utf8')).toBe(
        readFileSync(join(CANONICAL, rel), 'utf8'),
      );
    }
  });

  test('plugin manifests exist', () => {
    const MONO_ROOT = join(ROOT, '..');
    expect(existsSync(join(ROOT, 'plugins/feega/.claude-plugin/plugin.json'))).toBe(true);
    expect(existsSync(join(ROOT, 'plugins/feega/.codex-plugin/plugin.json'))).toBe(true);
    expect(existsSync(join(ROOT, 'plugins/feega/.mcp.json'))).toBe(true);
    expect(existsSync(join(MONO_ROOT, '.claude-plugin/marketplace.json'))).toBe(true);
    expect(existsSync(join(MONO_ROOT, '.agents/plugins/marketplace.json'))).toBe(true);
  });
});
