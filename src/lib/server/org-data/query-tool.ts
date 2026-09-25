/**
 * `query` PER IL NUOVO SCHEMA — org, non brand.
 *
 * È il gemello di `brand-data/query-tool.ts`, con la stessa forma di rifiuto e di errore, per due
 * clienti che quel file non conosce e che qui sono entrambi normali:
 *
 *   RLS-scoped (Bearer JWT via MCP HTTP)  →  `org_isolation` decide da sé; l'`orgId` qui è solo un
 *                                            filtro in più per restare sulla conversazione in corso,
 *                                            esattamente come `brand_id` nel gemello.
 *   service-role (chiave API `feega_…`)  →  non esiste nessun JWT da far valutare a Postgres — una
 *                                            chiave API non è un utente loggato — quindi il confine
 *                                            lo impone QUESTO CODICE: ogni lettura porta `org_id eq`
 *                                            per costruzione, mai per scelta di chi chiama. Un id di
 *                                            un'altra org restituisce zero righe, mai un errore che
 *                                            differenzi «non esiste» da «non è tuo».
 *
 * Le 26 tabelle sono `ORG_TABLES` (org-data/tables.ts), non `QUERY_TABLES`: quel file resta dello
 * schema vecchio, letto da `brand-data/query-tool.ts`, e i due non si toccano.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ORG_TABLES, type OrgTable } from './tables';
import { logAiCall } from '$lib/server/ai-log';

export const QUERY_DEFAULT_ROWS = 20;
export const QUERY_MAX_ROWS = 200;
export const QUERY_MAX_CHARS = 60_000;
export const QUERY_MAX_VALUE_CHARS = 2_000;
export const QUERY_MAX_DOC_CHARS = 40_000;
export const QUERY_ABORT_MS = 12_000;

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'cd'] as const;
type Op = (typeof OPS)[number];

export const ORG_QUERY_TABLE_LIST: readonly string[] = ORG_TABLES;

export const ORG_NO_AUTHORITY_ERROR = {
  error: 'no_authority',
  message:
    '`query` needs either your own Supabase session (RLS decides what you see) or a resolved API key ' +
    '(this code enforces org_id on every read). Neither was given to this call — it is a bug in the ' +
    'caller, not something you can fix by retrying.',
  fix: 'This is an internal wiring error. Report it rather than retrying with different arguments.'
} as const;

type Filter = {
  column: string;
  op: Op;
  value: string | number | boolean | null | Array<string | number>;
  negate?: boolean;
};
type Order = { column: string; ascending?: boolean; nullsFirst?: boolean };
type Embed = { table: string; columns?: string[] };

function wireValue(op: Op, value: Filter['value']): string {
  if (op === 'in') {
    const items = Array.isArray(value) ? value : [value as string | number];
    return `(${items.map((v) => String(v)).join(',')})`;
  }
  if (value === null) return 'null';
  return String(value);
}

const wireOp = (f: Filter): string => (f.negate ? `not.${f.op}` : f.op);

const wireEmbed = (e: Embed): string =>
  `${e.table.trim()}(${e.columns?.length ? e.columns.map((c) => c.trim()).join(',') : '*'})`;

const asList = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function trimRow(
  row: Record<string, unknown>,
  cap: number = QUERY_MAX_VALUE_CHARS
): { row: Record<string, unknown>; cut: string[] } {
  const cut: string[] = [];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const text = typeof v === 'string' ? v : v && typeof v === 'object' ? JSON.stringify(v) : null;
    if (text !== null && text.length > cap) {
      out[k] = text.slice(0, cap) + `… [cut, ${text.length} chars total]`;
      cut.push(k);
    } else out[k] = v;
  }
  return { row: out, cut };
}

export function explainOrgDbError(code: string | undefined, message: string, hint?: string | null): string {
  switch (code) {
    case 'PGRST205':
      return `${hint ? hint + '. ' : ''}Call query with no table to list every table you can name.`;
    case '42703':
      return 'That column does not exist. Call query with just the table (no columns) to get one real row back — its keys ARE the column list.';
    case '42501':
      return 'RLS denied this read: this row belongs to an org you are not a member of. There is no way around it — pick a table tied to your own org.';
    case '57014':
      return `The database gave up: statement_timeout is 8s on this role and the query took longer. Add a where filter on an indexed column (org_id, created_at), lower the limit, or select fewer columns.`;
    case 'PGRST200':
      return 'No foreign-key relationship between those two tables, so `embed` cannot reach it — embedding follows declared foreign keys only. Read the second table with its own call and match the ids yourself.';
    case 'PGRST100':
      return 'PostgREST could not parse the filter. `op` must be one of: ' + OPS.join(', ') + '.';
    default:
      return `Unrecognized database error. Call query with no table to see what exists. Raw: ${message}`;
  }
}

/**
 * QUALE DEI DUE CANCELLI, e con quale forza impone `org_id`.
 *
 *   rls      → un client anon+JWT: Postgres applica `org_isolation` da solo. Il filtro `org_id`
 *              aggiunto qui resta un affinamento sulla conversazione, non l'unica difesa.
 *   service  → un client service-role (`bypassrls`): SENZA il filtro imposto qui, la lettura
 *              vedrebbe ogni org di ogni cliente. Qui il filtro non è un affinamento, è IL confine.
 */
export type OrgQueryAuthority =
  | { kind: 'rls'; supabase: SupabaseClient }
  | { kind: 'service'; supabase: SupabaseClient };

export type QueryToolDeps = {
  authority: OrgQueryAuthority;
  orgId: string;
  userId?: string;
  threadId?: string;
};

export function createOrgQueryTool({ authority, orgId, userId, threadId }: QueryToolDeps) {
  return {
    query: tool({
      description: [
        'Read ANY table this org can see — orgs, projects, canvases, nodes, connections, assets, ' +
          'posts, ads, products, social accounts, everything. There is no SQL: you name a table, ' +
          'columns and filters, and it issues one PostgREST read.',
        '',
        'DISCOVERY: call with no `table` to get every table name. Call with only `table` to get real ' +
          'rows back with all columns — the keys of a row ARE the schema.',
        '',
        'NAME THE COLUMNS YOU NEED. Without `columns` every column comes back, the character cap then ' +
          'drops whole rows to fit, and you get a short answer to a long question.',
        '',
        `CAPS, and every one that bites is named in \`limits\`: ${QUERY_DEFAULT_ROWS} rows by default, ` +
          `${QUERY_MAX_ROWS} max, ${QUERY_MAX_CHARS} chars max, 8s statement timeout. When rows were ` +
          `dropped, \`limits\` gives the \`offset\` that resumes exactly where it stopped.`,
        '',
        `This reads inside org ${orgId} only — every row you get back belongs to it, and a where ` +
          '`org_id` you pass yourself is ignored in favour of this org.',
        '',
        'A project has NO brand until one is attached — `projects.brand_id` is nullable, and that is ' +
          'the normal case, not an edge case. A canvas belongs to a project; nodes and their ' +
          'connections belong to a canvas. A post (the `posts` table) is a different thing from a ' +
          'node: a post is the promoted artifact — caption, media, brand — that gets scheduled or ' +
          'becomes an ad creative. `post_sources` links a post back to the nodes it came from.'
      ].join('\n'),
      inputSchema: z
        .object({
          table: z.string().optional().describe('Table name. Omit to list every table instead of reading one.'),
          columns: z.array(z.string()).optional().describe('Column names. Omit for all columns.'),
          where: z
            .array(
              z.object({
                column: z.string(),
                op: z.enum(OPS),
                value: z.union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.null(),
                  z.array(z.union([z.string(), z.number()]))
                ]),
                negate: z.boolean().optional()
              })
            )
            .optional(),
          order: z
            .union([
              z.object({ column: z.string(), ascending: z.boolean().optional(), nullsFirst: z.boolean().optional() }),
              z.array(z.object({ column: z.string(), ascending: z.boolean().optional(), nullsFirst: z.boolean().optional() }))
            ])
            .optional(),
          embed: z.array(z.object({ table: z.string(), columns: z.array(z.string()).optional() })).optional(),
          offset: z.number().int().min(0).optional(),
          count: z.enum(['estimated', 'exact']).optional(),
          limit: z.number().int().positive().optional()
        })
        .strict(),
      execute: async (input: {
        table?: string;
        columns?: string[];
        where?: Filter[];
        order?: Order | Order[];
        embed?: Embed[];
        offset?: number;
        count?: 'estimated' | 'exact';
        limit?: number;
      }) => {
        const t0 = Date.now();
        const finish = <T extends Record<string, unknown>>(out: T, note: string): T => {
          logAiCall({
            label: 'org_db_query',
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

        if (!input.table) {
          return finish(
            {
              tables: [...ORG_QUERY_TABLE_LIST],
              count: ORG_QUERY_TABLE_LIST.length,
              note: 'Every table this org can reach. Read one with query({ table: "<name>" }); the keys of the rows you get back are its columns.'
            },
            'org_db_query:tables'
          );
        }

        const table = input.table.trim();
        if (!IDENT.test(table)) {
          return finish(
            {
              error: 'not_an_identifier',
              message: `"${table}" is not a table name. There is no SQL here, so nothing else can go where a table name goes.`,
              fix: 'Call query with no table to see the valid names.'
            },
            'org_db_query:refused:bad_table'
          );
        }
        if (!ORG_TABLES.includes(table as OrgTable)) {
          return finish(
            {
              error: 'unknown_table',
              message: `"${table}" is not a table this surface can read.`,
              fix: 'Call query with no table to see the valid names.'
            },
            'org_db_query:refused:unknown_table'
          );
        }
        const bad = (input.columns ?? []).find((c) => c !== '*' && !IDENT.test(String(c).trim()));
        if (bad !== undefined) {
          return finish(
            {
              error: 'not_an_identifier',
              message: `"${bad}" is not a column name.`,
              fix: `Call query({ table: "${table}" }) with no columns to see what this table actually has.`
            },
            'org_db_query:refused:bad_column'
          );
        }
        const badFilter = (input.where ?? []).find((f) => !IDENT.test(String(f.column).trim()));
        if (badFilter) {
          return finish(
            { error: 'not_an_identifier', message: `"${badFilter.column}" is not a column name.`, fix: 'Filter columns are bare identifiers.' },
            'org_db_query:refused:bad_filter'
          );
        }
        const orders = asList(input.order);
        const badOrder = orders.find((o) => !IDENT.test(String(o.column).trim()));
        if (badOrder) {
          return finish(
            { error: 'not_an_identifier', message: `"${badOrder.column}" is not a column name.`, fix: 'Order by a bare column name.' },
            'org_db_query:refused:bad_order'
          );
        }
        const embeds = input.embed ?? [];
        const badEmbed = embeds.find(
          (e) => !IDENT.test(String(e.table).trim()) || (e.columns ?? []).some((c) => !IDENT.test(String(c).trim()))
        );
        if (badEmbed) {
          return finish(
            {
              error: 'not_an_identifier',
              message: `"${badEmbed.table}" and its columns must be bare identifiers.`,
              fix: 'Call query with no table to see the valid names.'
            },
            'org_db_query:refused:bad_embed'
          );
        }

        const limit = Math.min(input.limit ?? QUERY_DEFAULT_ROWS, QUERY_MAX_ROWS);
        const offset = Math.max(input.offset ?? 0, 0);
        const countMode = input.count ?? 'estimated';
        const own = input.columns?.length ? input.columns.map((c) => c.trim()).join(',') : '*';
        const withEmbeds = (base: string) => [base, ...embeds.map(wireEmbed)].join(',');
        const cols = withEmbeds(own);

        // Il filtro sull'org SI IMPONE sempre, qualunque cosa il modello abbia passato in `where`:
        // su `service` è l'unico confine che esiste, su `rls` è un affinamento sopra `org_isolation`.
        const filtriModello = (input.where ?? []).filter((f) => f.column.trim() !== 'org_id');
        const { supabase } = authority;

        const run = (selectCols: string) => {
          let q = supabase.from(table).select(selectCols, { count: countMode });
          for (const f of filtriModello) q = q.filter(f.column.trim(), wireOp(f), wireValue(f.op, f.value));
          q = q.filter('org_id', 'eq', orgId);
          for (const o of orders) {
            q = q.order(o.column.trim(), { ascending: o.ascending ?? false, nullsFirst: o.nullsFirst });
          }
          return q.range(offset, offset + limit - 1).abortSignal(AbortSignal.timeout(QUERY_ABORT_MS));
        };

        const { data, error, count } = await run(cols);

        if (error) {
          return finish(
            {
              error: error.code || 'db_error',
              message: error.message,
              details: error.details ?? undefined,
              fix: explainOrgDbError(error.code, error.message, error.hint)
            },
            `org_db_query:${table}:err:${error.code ?? '?'}`
          );
        }

        const all = (data ?? []) as unknown as Array<Record<string, unknown>>;
        const valueCap = all.length === 1 ? QUERY_MAX_DOC_CHARS : QUERY_MAX_VALUE_CHARS;
        const rows: Array<Record<string, unknown>> = [];
        const cutCols = new Set<string>();
        let chars = 0;
        for (const r of all) {
          const { row, cut } = trimRow(r, valueCap);
          const size = JSON.stringify(row).length;
          if (chars + size > QUERY_MAX_CHARS && rows.length > 0) break;
          rows.push(row);
          for (const c of cut) cutCols.add(c);
          chars += size;
        }
        const total = count ?? all.length;
        const exact = countMode === 'exact';

        const limits: string[] = [];
        limits.push(
          `${rows.length} rows${offset ? ` from offset ${offset}` : ''} of ${exact ? '' : '~'}${total} — narrow with a where filter or raise limit (max ${QUERY_MAX_ROWS}).`
        );
        if (rows.length < all.length) {
          limits.push(
            `Cut at ${QUERY_MAX_CHARS} chars: ${rows.length} of the ${all.length} rows the database returned are shown. Read the rest with offset: ${offset + rows.length}.`
          );
        } else if (total > offset + rows.length) {
          limits.push(`More rows follow: read them with offset: ${offset + rows.length}.`);
        }
        if (cutCols.size) {
          limits.push(
            `Values cut at ${valueCap} chars in: ${[...cutCols].join(', ')}. Read that single row again with limit: 1 and it comes back whole.`
          );
        }
        if (!exact && total > all.length) {
          limits.push(`Row total is the planner estimate — pass count: "exact" when the number is the answer.`);
        }

        return finish(
          { table, rows, returned: rows.length, total, limits: limits.join(' ') },
          `org_db_query:${table}:cols=${input.columns?.length ?? 0}:where=${input.where?.length ?? 0}:rows=${rows.length}/${total}`
        );
      }
    })
  };
}
