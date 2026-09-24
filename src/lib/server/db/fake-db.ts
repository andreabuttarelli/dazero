import type { Db } from '$lib/server/db/client';

/**
 * Il doppio del client, condiviso fra i test dei repository.
 *
 * Registra la QUERY che parte — tabella, operazione, payload, filtri — perché è lì che sta la
 * tenancy: una riga che torna giusta da una query senza `org_id` è comunque una fuga.
 *
 * `updateRows` separa le righe che un UPDATE torna da quelle che un SELECT torna: è così che si
 * simula un `writeNodeData` che non ha scritto (conflitto di versione) mentre `findNode` il nodo
 * lo trova ancora.
 */
export type Call = {
  table: string;
  op: string;
  payload?: unknown;
  filters: [string, unknown][];
  order?: [string, unknown];
  limit?: number;
};

export type FakeDb = { db: Db; calls: Call[] };

export type FakeOptions = { updateRows?: Record<string, unknown[]>; filter?: boolean };

export function fakeDb(rows: Record<string, unknown[]>, options: FakeOptions = {}): FakeDb {
  const calls: Call[] = [];
  const updateRows = options.updateRows ?? {};

  const allRowsFor = (op: string, table: string): unknown[] =>
    (op === 'update' ? (updateRows[table] ?? rows[table]) : rows[table]) ?? [];

  const matches = (row: Record<string, unknown>, [column, value]: [string, unknown]): boolean =>
    Array.isArray(value) ? value.includes(row[column]) : value === null ? row[column] == null : row[column] === value;

  const rowsFor = (op: string, table: string, filters: [string, unknown][] = []): unknown[] => {
    const all = allRowsFor(op, table);
    if (!options.filter) {
      return all;
    }
    return all.filter((row) => filters.every((f) => matches(row as Record<string, unknown>, f)));
  };

  const builder = (table: string, op: string, payload?: unknown) => {
    const call: Call = { table, op, payload, filters: [] };
    calls.push(call);

    const chain = {
      eq(column: string, value: unknown) {
        call.filters.push([column, value]);
        return chain;
      },
      is(column: string, value: unknown) {
        call.filters.push([column, value]);
        return chain;
      },
      in(column: string, values: unknown) {
        call.filters.push([column, values]);
        return chain;
      },
      gt(column: string, value: unknown) {
        call.filters.push([column, value]);
        return chain;
      },
      lt(column: string, value: unknown) {
        call.filters.push([column, value]);
        return chain;
      },
      order(column: string, opts?: unknown) {
        call.order = [column, opts];
        return chain;
      },
      limit(n: number) {
        call.limit = n;
        return chain;
      },
      select() {
        return chain;
      },
      single: async () => {
        const first = rowsFor(op, table, call.filters)[0];
        if (first !== undefined) {
          return { data: first, error: null };
        }
        if (op === 'insert' && payload) {
          return { data: { id: 'generated-id', ...(payload as object) }, error: null };
        }
        return { data: null, error: null };
      },
      maybeSingle: async () => ({ data: rowsFor(op, table, call.filters)[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rowsFor(op, table, call.filters), error: null })
    };
    return chain;
  };

  const db = {
    from: (table: string) => ({
      select: () => builder(table, 'select'),
      insert: (payload: unknown) => builder(table, 'insert', payload),
      upsert: (payload: unknown) => builder(table, 'upsert', payload),
      update: (payload: unknown) => builder(table, 'update', payload),
      delete: () => builder(table, 'delete')
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          calls.push({ table: `storage:${bucket}`, op: 'sign', filters: [['path', path]] });
          return { data: { signedUrl: `https://signed.example/${bucket}/${path}` }, error: null };
        },
        createSignedUrls: async (paths: string[]) => {
          calls.push({ table: `storage:${bucket}`, op: 'sign', filters: [['paths', paths]] });
          return {
            data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${bucket}/${path}` })),
            error: null
          };
        },
        upload: async (path: string) => {
          calls.push({ table: `storage:${bucket}`, op: 'upload', filters: [['path', path]] });
          return { data: { path }, error: null };
        }
      })
    }
  } as unknown as Db;

  return { db, calls };
}

export const filtersOf = (calls: Call[], op: string): Record<string, unknown> =>
  Object.fromEntries(calls.find((c) => c.op === op)!.filters);
