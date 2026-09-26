import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appPathForBrand, joinAppPath, projectIdOfBrand } from './brand-slug';

type ProjectRow = { id: string; created_at: string; archived_at: string | null };

/** Chainable builder: `.select().eq().is().order().limit()` → the resolved rows, actually
 *  sorted and sliced — the ordering itself is what the "several projects" case tests. */
function projectsClient(rows: ProjectRow[]) {
  let sorted = rows;
  let sliced = rows;
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: (column: 'created_at', opts?: { ascending?: boolean }) => {
      const dir = opts?.ascending === false ? -1 : 1;
      sorted = [...sorted].sort((a, b) => (a[column] < b[column] ? -dir : a[column] > b[column] ? dir : 0));
      sliced = sorted;
      return builder;
    },
    limit: (n: number) => {
      sliced = sorted.slice(0, n);
      return builder;
    },
    then: (resolve: (v: { data: ProjectRow[]; error: null }) => void) => resolve({ data: sliced, error: null })
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe('projectIdOfBrand', () => {
  it('returns null when the brand has no project', async () => {
    const client = projectsClient([]);
    expect(await projectIdOfBrand(client, 'brand-1')).toBeNull();
  });

  it('returns the project when the brand has exactly one', async () => {
    const client = projectsClient([{ id: 'proj-1', created_at: '2026-01-01', archived_at: null }]);
    expect(await projectIdOfBrand(client, 'brand-1')).toBe('proj-1');
  });

  it('picks the oldest project when a brand maps to several', async () => {
    const client = projectsClient([
      { id: 'proj-new', created_at: '2026-06-01', archived_at: null },
      { id: 'proj-old', created_at: '2026-01-01', archived_at: null }
    ]);
    expect(await projectIdOfBrand(client, 'brand-1')).toBe('proj-old');
  });
});

describe('appPathForBrand', () => {
  it('builds a /p/<projectId> path when the brand has a project', async () => {
    const client = projectsClient([{ id: 'proj-1', created_at: '2026-01-01', archived_at: null }]);
    expect(await appPathForBrand(client, 'brand-1', '/calendar')).toBe('/p/proj-1/calendar');
  });

  it('defaults to the projects root when no sub-path is given', async () => {
    const client = projectsClient([{ id: 'proj-1', created_at: '2026-01-01', archived_at: null }]);
    expect(await appPathForBrand(client, 'brand-1')).toBe('/p/proj-1');
  });

  it('falls back to the bootstrap /app when the brand has no project', async () => {
    const client = projectsClient([]);
    expect(await appPathForBrand(client, 'brand-1', '/calendar')).toBe('/app');
  });
});

describe('joinAppPath', () => {
  it('appends the sub-path to a resolved project base', () => {
    expect(joinAppPath('/p/proj-1', '/calendar')).toBe('/p/proj-1/calendar');
  });

  it('drops the sub-path on the bootstrap — /app takes no further segment', () => {
    expect(joinAppPath('/app', '/calendar')).toBe('/app');
  });
});
