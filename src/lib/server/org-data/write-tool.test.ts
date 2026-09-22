import { describe, expect, it, vi } from 'vitest';
import { createOrgWriteTools } from './write-tool';

vi.mock('$lib/server/ai-log', () => ({ logAiCall: vi.fn() }));
vi.mock('./presence', () => ({ announcePresence: vi.fn().mockResolvedValue(undefined) }));

type Call = { op: string; table: string; filters: string[][]; values?: Record<string, unknown> };

function fakeAuthority(opts: {
  countRows?: Array<Record<string, unknown>>;
  count?: number;
  writeRows?: Array<Record<string, unknown>>;
  error?: { code: string; message: string; details?: string | null };
}) {
  const calls: Call[] = [];

  const countBuilder = (table: string) => {
    const rec: Call = { op: 'count', table, filters: [] };
    calls.push(rec);
    const b = {
      filter: (c: string, _op: string, v: string) => {
        rec.filters.push([c, v]);
        return b;
      },
      not: (c: string, _op: string, v: string) => {
        rec.filters.push([`not:${c}`, v]);
        return b;
      },
      limit: () => b,
      abortSignal: () => Promise.resolve({ count: opts.count ?? (opts.countRows ?? []).length, error: null })
    };
    return b;
  };

  const writeBuilder = (op: string, table: string, values?: Record<string, unknown>) => {
    const rec: Call = { op, table, filters: [], values };
    calls.push(rec);
    const b = {
      filter: (c: string, _op: string, v: string) => {
        rec.filters.push([c, v]);
        return b;
      },
      not: (c: string, _op: string, v: string) => {
        rec.filters.push([`not:${c}`, v]);
        return b;
      },
      select: () => b,
      abortSignal: () => Promise.resolve({ data: opts.error ? null : opts.writeRows ?? [], error: opts.error ?? null })
    };
    return b;
  };

  const supabase = {
    from: (table: string) => ({
      select: (_cols: string, o?: { count?: string }) => (o?.count ? countBuilder(table) : writeBuilder('select', table)),
      insert: (values: Record<string, unknown>) => writeBuilder('insert', table, values),
      update: (values: Record<string, unknown>) => writeBuilder('update', table, values),
      delete: () => writeBuilder('delete', table)
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { calls, supabase };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tools = (supabase: unknown, orgId: string): Record<string, (input: any) => Promise<any>> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createOrgWriteTools({ authority: { kind: 'service', supabase: supabase as any }, orgId }) as any;

describe('insert_row: org_id si impone, non si corregge in silenzio', () => {
  it('un org_id diverso da quello della sessione è rifiutato, e niente viene scritto', async () => {
    const { calls, supabase } = fakeAuthority({ writeRows: [{ id: 'p1' }] });

    const out = await tools(supabase, 'org-mine').insertRow({
      table: 'projects',
      values: { name: 'x', slug: 'x', org_id: 'org-altrui' }
    });

    expect(out.error).toBe('wrong_org');
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('org_id è sempre scritto con quello della sessione, mai omesso', async () => {
    const { calls, supabase } = fakeAuthority({ writeRows: [{ id: 'p1' }] });

    await tools(supabase, 'org-mine').insertRow({ table: 'projects', values: { name: 'x', slug: 'x' } });

    const insertCall = calls.find((c) => c.op === 'insert');
    expect(insertCall?.values).toMatchObject({ org_id: 'org-mine' });
  });

  it('una tabella fuori dalle 26 è rifiutata prima di qualunque scrittura', async () => {
    const { calls, supabase } = fakeAuthority({});

    const out = await tools(supabase, 'org-mine').insertRow({ table: 'organizations', values: { name: 'x' } });

    expect(out.error).toBe('unknown_table');
    expect(calls).toHaveLength(0);
  });
});

describe('update_row / delete_row: org_id si impone sul filtro, un id di un\'altra org non trova niente', () => {
  it('update: un where su org_id passato da chi chiama viene ignorato, si usa quello della sessione', async () => {
    const { calls, supabase } = fakeAuthority({ count: 1, writeRows: [{ id: 'n1', org_id: 'org-mine' }] });

    await tools(supabase, 'org-mine').updateRow({
      table: 'nodes',
      where: [{ column: 'org_id', op: 'eq', value: 'org-altrui' }, { column: 'id', op: 'eq', value: 'n1' }],
      values: { display_name: 'x' }
    });

    const countCall = calls.find((c) => c.op === 'count');
    expect(countCall?.filters).toContainEqual(['org_id', 'org-mine']);
    expect(countCall?.filters).not.toContainEqual(['org_id', 'org-altrui']);
  });

  it('un id che non appartiene a questa org conta zero righe, mai un errore che lo distingua da "non esiste"', async () => {
    const { supabase } = fakeAuthority({ count: 0 });

    const out = await tools(supabase, 'org-mine').updateRow({
      table: 'nodes',
      where: [{ column: 'id', op: 'eq', value: 'nodo-di-unaltra-org' }],
      values: { display_name: 'x' }
    });

    expect(out.error).toBe('no_rows_matched');
    expect(out.matched).toBe(0);
  });

  it('delete: stesso confine — org_id si impone sul filtro', async () => {
    const { calls, supabase } = fakeAuthority({ count: 1, writeRows: [{ id: 'n1' }] });

    await tools(supabase, 'org-mine').deleteRow({
      table: 'nodes',
      where: [{ column: 'id', op: 'eq', value: 'n1' }]
    });

    const countCall = calls.find((c) => c.op === 'count');
    expect(countCall?.filters).toContainEqual(['org_id', 'org-mine']);
  });
});
