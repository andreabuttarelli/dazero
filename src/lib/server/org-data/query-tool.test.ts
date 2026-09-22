import { describe, expect, it, vi } from 'vitest';
import { createOrgQueryTool, ORG_QUERY_TABLE_LIST } from './query-tool';
import { ORG_TABLES } from './tables';

vi.mock('$lib/server/ai-log', () => ({ logAiCall: vi.fn() }));

type Call = {
  table: string;
  cols: string;
  filters: string[][];
  range?: [number, number];
};

function fakeAuthority(opts: { rows?: Array<Record<string, unknown>>; count?: number; error?: { code: string; message: string } }) {
  const calls: Call[] = [];
  const supabase = {
    from: (table: string) => ({
      select: (cols: string) => {
        const rec: Call = { table, cols, filters: [] };
        calls.push(rec);
        const builder = {
          filter: (c: string, _op: string, v: string) => {
            rec.filters.push([c, v]);
            return builder;
          },
          order: () => builder,
          range: (from: number, to: number) => {
            rec.range = [from, to];
            return builder;
          },
          abortSignal: () =>
            Promise.resolve({ data: opts.error ? null : opts.rows ?? [], error: opts.error ?? null, count: opts.count ?? null })
        };
        return builder;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { calls, supabase };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (supabase: any, orgId: string, input: Record<string, unknown>): Promise<any> =>
  (
    createOrgQueryTool({
      authority: { kind: 'service', supabase },
      orgId
    }).query as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).execute(input, {});

describe('il confine è org_id, imposto dal codice — non un affinamento facoltativo', () => {
  it('un id di un\'altra org non torna niente: la lettura porta sempre org_id eq per costruzione', async () => {
    const { calls, supabase } = fakeAuthority({ rows: [] });

    await run(supabase, 'org-mine', { table: 'projects', where: [{ column: 'id', op: 'eq', value: 'someone-elses-project' }] });

    expect(calls[0].filters).toContainEqual(['org_id', 'org-mine']);
  });

  it('un org_id passato da chi chiama nel where viene ignorato: si impone quello della sessione, mai quello scritto', async () => {
    const { calls, supabase } = fakeAuthority({ rows: [] });

    await run(supabase, 'org-mine', {
      table: 'projects',
      where: [{ column: 'org_id', op: 'eq', value: 'org-altrui' }]
    });

    const orgFilters = calls[0].filters.filter(([c]) => c === 'org_id');
    expect(orgFilters).toEqual([['org_id', 'org-mine']]);
  });

  it('esiste esattamente un filtro org_id per chiamata, mai due che potrebbero divergere', async () => {
    const { calls, supabase } = fakeAuthority({ rows: [] });

    await run(supabase, 'org-mine', { table: 'nodes' });

    expect(calls[0].filters.filter(([c]) => c === 'org_id')).toHaveLength(1);
  });

  it('una tabella fuori dalle 26 del nuovo schema è rifiutata prima di qualunque richiesta', async () => {
    const { calls, supabase } = fakeAuthority({ rows: [] });

    const out = await run(supabase, 'org-mine', { table: 'organizations' });

    expect(out.error).toBe('unknown_table');
    expect(calls).toHaveLength(0);
  });

  it('la lista delle tabelle è esattamente ORG_TABLES, niente di più niente di meno', () => {
    expect([...ORG_QUERY_TABLE_LIST].sort()).toEqual([...ORG_TABLES].sort());
  });
});
