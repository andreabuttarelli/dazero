import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_MAX_DURATION_S } from '../src/lib/server/brand-agent/limits';

const ROUTES_DIR = 'src/routes';
const ROUTE_CONFIG = /export const config = \{ maxDuration: ([A-Z_0-9]+) \}/;
const NAMED_DURATIONS: Record<string, number> = { AGENT_MAX_DURATION_S };

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return routeFiles(path);
    }
    return /^\+(page|layout|server)(\.server)?\.ts$/.test(entry.name) ? [path] : [];
  });
}

function adapterMaxDuration(): number | null {
  const match = readFileSync('svelte.config.js', 'utf8').match(/vercelAdapter\(\{[^}]*maxDuration: (\d+)/);
  return match ? Number(match[1]) : null;
}

function declaredDurations(): { path: string; seconds: number }[] {
  return routeFiles(ROUTES_DIR).flatMap((path) => {
    const match = readFileSync(path, 'utf8').match(ROUTE_CONFIG);
    if (!match) {
      return [];
    }
    const seconds = NAMED_DURATIONS[match[1]] ?? Number(match[1]);
    return [{ path, seconds }];
  });
}

describe('one Vercel function for the whole app', () => {
  it('sets maxDuration on the adapter, so routes without a config share it', () => {
    expect(adapterMaxDuration()).not.toBeNull();
  });

  it('keeps every route config equal to the adapter default: each distinct value emits another full function', () => {
    const fallback = adapterMaxDuration();
    const outliers = declaredDurations().filter((route) => route.seconds !== fallback);
    expect(outliers).toEqual([]);
  });
});
