/**
 * `insert_row` / `update_row` / `delete_row` PER IL NUOVO SCHEMA — org, non brand.
 *
 * Gemello di `brand-data/write-tool.ts`: stesso cancello, stesso motivo, e la stessa asimmetria fra
 * i due clienti che il gemello non conosce — vedi `query-tool.ts` accanto per la spiegazione intera.
 * Qui vale il doppio: `org_id` non si aggiunge quando manca, si IMPONE sempre, perché una scrittura
 * sbagliata mette la riga nell'org sbagliata e non solo la fa leggere a chi non doveva.
 *
 * `nodes` e `nodes_connections` sono le due tabelle del canvas (§8bis di NEW_DATABASE_STRUCTURE.md):
 * un agente che le scrive deve annunciarsi sul canale del canvas PRIMA di toccare le righe, o edita
 * invisibile mentre qualcuno guarda la stessa tela. `announcePresence` lo fa qui, un'unica volta,
 * invece che in ogni chiamante — un tool nuovo che scrive `nodes` lo eredita per il fatto di passare
 * da questo file.
 */
import { ORG_TABLES, CANVAS_WRITE_TABLES, type OrgTable } from './tables';
import { ORG_TABLE_CHECKS } from './checks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAiCall } from '$lib/server/ai-log';
import type { OrgQueryAuthority } from './query-tool';
import { announcePresence } from './presence';
import type { Actor } from '$lib/server/repos/actor';

export const UPDATE_MAX_ROWS = 50;
export const DELETE_MAX_ROWS = 10;
export const WRITE_ABORT_MS = 12_000;

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const TABLES = new Set<string>(ORG_TABLES);

const CONSTRAINT_NAME = /violates check constraint "([^"]+)"/;
const UNIQUE_NAME = /violates unique constraint "([^"]+)"/;

type Filter = {
  column: string;
  op: string;
  value: string | number | boolean | null | Array<string | number>;
  negate?: boolean;
};

function wireValue(op: string, value: Filter['value']): string {
  if (op === 'in') {
    const items = Array.isArray(value) ? value : [value as string | number];
    return `(${items.map((v) => String(v)).join(',')})`;
  }
  if (value === null) return 'null';
  return String(value);
}

function explainOrgWriteError(
  code: string | undefined,
  message: string,
  details: string | null | undefined,
  table: string
): string {
  switch (code) {
    case '23514': {
      const name = CONSTRAINT_NAME.exec(message)?.[1] ?? '';
      const definition = ORG_TABLE_CHECKS[name];
      return definition
        ? `Constraint ${name} allows only: ${definition}. Send a value that satisfies it.`
        : `A CHECK constraint (${name || 'unnamed'}) refused this value. Read one existing row of ${table} with \`query\` to see what shape the column really takes.`;
    }
    case '23505':
      return `${details ? details + ' ' : ''}That row is already there, and nothing was replaced — on purpose. The unique key is ${UNIQUE_NAME.exec(message)?.[1] ?? 'the one named in the message'}: change the existing row with update_row filtering on those columns.`;
    case '23502':
      return `${message} That column has no default: send it, or the row cannot exist.`;
    case '23503':
      return `${details ? details + ' ' : ''}A foreign key points at a row that does not exist. Read the parent table with \`query\` and use an id it really has.`;
    case '42501':
      return `RLS refused this row: it does not belong to your org, or is a table only the system writes. Read ${table} with \`query\` to see which rows are reachable at all.`;
    case '22P02':
    case '22007':
      return `A value has the wrong type for its column. Read one row of ${table} with \`query\`: the values show the shape each column takes.`;
    case '57014':
      return 'The database gave up: statement_timeout is 8s on this role. Narrow the filter so fewer rows are touched.';
    case 'PGRST205':
      return `No table called ${table}. Call \`query\` with no table to list every name.`;
    default:
      return `Unrecognized database error. Read one row of ${table} with \`query\`. Raw: ${message}`;
  }
}

export const ORG_NO_AUTHORITY_WRITE_ERROR = {
  error: 'no_authority',
  message:
    '`insert_row`/`update_row`/`delete_row` need either your own Supabase session or a resolved API ' +
    'key. Neither was given to this call — it is a bug in the caller, not something a retry fixes.',
  fix: 'Internal wiring error. Report it.'
} as const;

type InsertInput = { table: string; values: Record<string, unknown> };
type UpdateInput = { table: string; where: Filter[]; values: Record<string, unknown> };
type DeleteInput = { table: string; where: Filter[] };

type Refusal = { error: string; message: string; fix?: string };

function badIdentifier(table: string, values: Record<string, unknown>, where: Filter[]): Refusal | null {
  if (!IDENT.test(table.trim())) {
    return {
      error: 'not_an_identifier',
      message: `"${table}" is not a table name. There is no SQL here, so a DELETE or a DROP has nowhere to go.`,
      fix: 'Call `query` with no table to see the valid names.'
    };
  }

  const column = [...Object.keys(values), ...where.map((f) => String(f.column))].find(
    (c) => !IDENT.test(String(c).trim())
  );
  if (column !== undefined) {
    return {
      error: 'not_an_identifier',
      message: `"${column}" is not a column name.`,
      fix: `Call query({ table: "${table}" }) with no columns to see what this table actually has.`
    };
  }

  if (!TABLES.has(table.trim())) {
    return {
      error: 'unknown_table',
      message: `"${table}" is not a table this surface can write.`,
      fix: 'Call `query` with no table to list every name you can write to.'
    };
  }

  return null;
}

export type WriteToolDeps = {
  authority: OrgQueryAuthority;
  orgId: string;
  userId?: string;
  threadId?: string;
  /** Chi sta scrivendo — serve solo per l'annuncio di presenza su `nodes`/`nodes_connections`. */
  actor?: Actor;
};

export function createOrgWriteTools({ authority, orgId, userId, threadId, actor }: WriteToolDeps) {
  const { supabase } = authority;

  const finish = <T extends Record<string, unknown>>(out: T, note: string, t0: number): T => {
    logAiCall({
      label: 'org_db_write',
      provider: 'internal',
      ms: Date.now() - t0,
      ok: !('error' in out),
      error: 'error' in out ? String(out.error) : undefined,
      context: note.slice(0, 400),
      orgId,
      userId: userId || undefined,
      threadId
    });
    return out;
  };

  const columnsOf = async (table: string): Promise<string[]> => {
    const probe = await supabase.from(table).select('*').eq('org_id', orgId).limit(1).abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));
    const sample = (probe.data ?? [])[0] as Record<string, unknown> | undefined;
    return sample ? Object.keys(sample) : [];
  };

  const failed = async (
    table: string,
    error: { code?: string; message: string; details?: string | null },
    note: string,
    t0: number
  ) => {
    const wrongColumn = error.code === '42703' || error.code === 'PGRST204';
    const available = wrongColumn ? await columnsOf(table) : [];

    return finish(
      {
        error: error.code || 'db_error',
        message: error.message,
        fix: available.length
          ? `A column you named does not exist on ${table}, and the write was NOT retried with a guess. Real columns: ${available.join(', ')}.`
          : explainOrgWriteError(error.code, error.message, error.details, table),
        ...(available.length ? { columns_available: available } : {})
      },
      note,
      t0
    );
  };

  /**
   * Dopo la scrittura, mai prima: `canvas_id` lo si legge dalla riga scritta, ed è l'unico momento
   * in cui è garantito di averla — un `where` generico non lo porta per costruzione.
   */
  const canvasAnnounce = async (table: string, rows: Array<Record<string, unknown>>) => {
    if (!CANVAS_WRITE_TABLES.has(table) || !actor) return;
    const canvasIds = new Set(rows.map((r) => r.canvas_id).filter((v): v is string => typeof v === 'string'));
    const nodeIds = rows.map((r) => r.id).filter((v): v is string => typeof v === 'string');
    await Promise.all(
      [...canvasIds].map((canvasId) => announcePresence({ canvasId, nodeIds, actor }).catch(() => {}))
    );
  };

  const insertRow = async (input: InsertInput) => {
    const t0 = Date.now();
    const values = input.values ?? {};

    const refusal = badIdentifier(input.table, values, []);
    if (refusal) return finish(refusal, `org_db_write:refused:${refusal.error}`, t0);

    if (!Object.keys(values).length) {
      return finish(
        {
          error: 'no_values',
          message: 'An insert with no columns is an empty row, not a row.',
          fix: `Read one row of ${input.table} with \`query\` and send the columns that matter.`
        },
        'org_db_write:refused:no_values',
        t0
      );
    }

    const table = input.table.trim() as OrgTable;
    const named = values.org_id;
    if (named !== undefined && named !== null && String(named) !== orgId) {
      return finish(
        {
          error: 'wrong_org',
          message: `This session is org ${orgId}, and the row names ${String(named)}. Nothing was written and nothing was corrected for you.`,
          fix: `Drop \`org_id\` — it is filled in with ${orgId} for you.`
        },
        'org_db_write:refused:wrong_org',
        t0
      );
    }

    const { data, error } = await supabase
      .from(table)
      .insert({ ...values, org_id: orgId })
      .select()
      .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    if (error) return failed(table, error, `org_db_write:${table}:insert:err:${error.code ?? '?'}`, t0);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    await canvasAnnounce(table, rows);
    return finish(
      { table, row: rows[0], inserted: rows.length },
      `org_db_write:${table}:insert:cols=${Object.keys(values).length}`,
      t0
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Filterable = { filter: (c: string, o: string, v: string) => any; not: (c: string, o: string, v: string) => any };
  const filtered = <T extends Filterable>(q: T, where: Filter[]) => {
    let out = q;
    for (const f of where) {
      const column = String(f.column).trim();
      if (column === 'org_id') continue; // si impone sotto, mai due volte e mai un valore diverso
      const value = wireValue(f.op, f.value);
      out = f.negate ? out.not(column, f.op, value) : out.filter(column, f.op, value);
    }
    return out.filter('org_id', 'eq', orgId);
  };

  const updateRow = async (input: UpdateInput) => {
    const t0 = Date.now();
    const values = input.values ?? {};
    const where = input.where ?? [];

    const refusal = badIdentifier(input.table, values, where);
    if (refusal) return finish(refusal, `org_db_write:refused:${refusal.error}`, t0);

    if (!where.length) {
      return finish(
        {
          error: 'where_required',
          message: 'An update with no filter rewrites every row of this org in that table.',
          fix: 'Name the rows: where: [{ column: "id", op: "eq", value: "<the id>" }].'
        },
        'org_db_write:refused:where_required',
        t0
      );
    }
    if (!Object.keys(values).length) {
      return finish(
        { error: 'no_values', message: 'An update with no columns changes nothing.', fix: 'Send the columns you want to change.' },
        'org_db_write:refused:no_values',
        t0
      );
    }

    const table = input.table.trim() as OrgTable;
    const count = await filtered(supabase.from(table).select('*', { count: 'exact' }), where)
      .limit(1)
      .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    if (count.error) return failed(table, count.error, `org_db_write:${table}:count:err:${count.error.code ?? '?'}`, t0);

    const matched = count.count ?? 0;
    if (matched === 0) {
      return finish(
        {
          error: 'no_rows_matched',
          message: `No row of ${table} matches that filter inside this org, so nothing was written.`,
          fix: 'Read the rows with `query` using the same filter.',
          matched: 0
        },
        `org_db_write:${table}:update:no_rows`,
        t0
      );
    }
    if (matched > UPDATE_MAX_ROWS) {
      return finish(
        {
          error: 'too_many_rows',
          message: `That filter matches ${matched} rows and the ceiling is ${UPDATE_MAX_ROWS}. Nothing was written.`,
          fix: 'Narrow the filter.',
          matched
        },
        `org_db_write:${table}:update:too_many:${matched}`,
        t0
      );
    }

    const written = await filtered(supabase.from(table).update(values), where)
      .select()
      .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    if (written.error) return failed(table, written.error, `org_db_write:${table}:update:err:${written.error.code ?? '?'}`, t0);

    const rows = (written.data ?? []) as Array<Record<string, unknown>>;
    await canvasAnnounce(table, rows);
    return finish(
      {
        table,
        rows,
        updated: rows.length,
        matched,
        note: `Only ${Object.keys(values).join(', ')} changed — every other column of those rows is untouched.`
      },
      `org_db_write:${table}:update:rows=${rows.length}/${matched}`,
      t0
    );
  };

  const deleteRow = async (input: DeleteInput) => {
    const t0 = Date.now();
    const where = input.where ?? [];

    const refusal = badIdentifier(input.table, {}, where);
    if (refusal) return finish(refusal, `org_db_write:refused:${refusal.error}`, t0);

    if (!where.length) {
      return finish(
        {
          error: 'where_required',
          message: 'A delete with no filter empties every row of this org in that table.',
          fix: 'Name the rows: where: [{ column: "id", op: "eq", value: "<the id>" }].'
        },
        'org_db_write:refused:where_required',
        t0
      );
    }

    const table = input.table.trim() as OrgTable;
    const count = await filtered(supabase.from(table).select('*', { count: 'exact' }), where)
      .limit(1)
      .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    if (count.error) return failed(table, count.error, `org_db_write:${table}:count:err:${count.error.code ?? '?'}`, t0);

    const matched = count.count ?? 0;
    if (matched === 0) {
      return finish(
        {
          error: 'no_rows_matched',
          message: `No row of ${table} matches that filter inside this org, so nothing was removed.`,
          fix: 'Read the rows with `query` using the same filter.',
          matched: 0
        },
        `org_db_write:${table}:delete:no_rows`,
        t0
      );
    }
    if (matched > DELETE_MAX_ROWS) {
      return finish(
        {
          error: 'too_many_rows',
          message: `That filter matches ${matched} rows and the ceiling is ${DELETE_MAX_ROWS}. Nothing was removed.`,
          fix: 'Narrow the filter. Read them with `query` first.',
          matched
        },
        `org_db_write:${table}:delete:too_many:${matched}`,
        t0
      );
    }

    const removed = await filtered(supabase.from(table).delete(), where)
      .select()
      .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    if (removed.error) return failed(table, removed.error, `org_db_write:${table}:delete:err:${removed.error.code ?? '?'}`, t0);

    const rows = (removed.data ?? []) as Array<Record<string, unknown>>;
    await canvasAnnounce(table, rows);
    return finish(
      { table, deleted: rows.length, matched, note: 'Gone. Nothing here restores them.' },
      `org_db_write:${table}:delete:rows=${rows.length}/${matched}`,
      t0
    );
  };

  return { insertRow, updateRow, deleteRow };
}

export type { SupabaseClient };
