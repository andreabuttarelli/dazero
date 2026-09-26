import { describe, it, expect } from 'vitest';
import { getBrandsList, getBrandDetail } from './cli-queries';

type Filter = { op: string; column: string; value: unknown };

function fakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      let wantsCount = false;
      let headOnly = false;

      const rowsFor = () => (tables[table] ?? []).filter((row) => filters.every((f) => matches(row, f)));

      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          wantsCount = opts?.count === 'exact';
          headOnly = Boolean(opts?.head);
          return q;
        },
        eq: (column: string, value: unknown) => {
          filters.push({ op: 'eq', column, value });
          return q;
        },
        in: (column: string, values: unknown[]) => {
          filters.push({ op: 'in', column, value: values });
          return q;
        },
        order: () => Promise.resolve({ data: rowsFor(), error: null }),
        limit: () => Promise.resolve({ data: rowsFor(), error: null }),
        maybeSingle: () => {
          const rows = rowsFor();
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then: (resolve: (v: { data: unknown; count: number | null; error: null }) => void) => {
          const rows = rowsFor();
          resolve({ data: headOnly ? null : rows, count: wantsCount ? rows.length : null, error: null });
        }
      });
      return q;
    }
  };
  return client;
}

function matches(row: Record<string, unknown>, f: Filter): boolean {
  const value = row[f.column] ?? null;
  if (f.op === 'eq') return value === f.value;
  if (f.op === 'in') return Array.isArray(f.value) && (f.value as unknown[]).includes(value);
  return true;
}

type SupabaseLike = Parameters<typeof getBrandsList>[0];

describe('getBrandsList sullo schema nuovo', () => {
  it('legge solo colonne reali di brands e conta i post in attesa come pendenti', async () => {
    const client = fakeSupabase({
      brands: [{ id: 'b1', name: 'Acme', slug: 'acme' }],
      posts: [
        { brand_id: 'b1', status: 'pending_user' },
        { brand_id: 'b1', status: 'pending_user' },
        { brand_id: 'b1', status: 'approved' }
      ]
    });

    const brands = await getBrandsList(client as unknown as SupabaseLike);

    expect(brands).toEqual([{ id: 'b1', name: 'Acme', slug: 'acme', pendingCount: 2 }]);
  });
});

describe('getBrandDetail sullo schema nuovo', () => {
  it('conta prodotti, account e post in attesa senza nominare colonne inesistenti', async () => {
    const client = fakeSupabase({
      posts: [
        { brand_id: 'b1', status: 'pending_user' },
        { brand_id: 'b1', status: 'published' }
      ],
      products: [{ brand_id: 'b1' }],
      social_accounts: [{ brand_id: 'b1' }, { brand_id: 'b1' }]
    });

    const detail = await getBrandDetail(client as unknown as SupabaseLike, 'b1');

    expect(detail.pendingCount).toBe(1);
    expect(detail.productCount).toBe(1);
    expect(detail.accountCount).toBe(2);
  });
});
