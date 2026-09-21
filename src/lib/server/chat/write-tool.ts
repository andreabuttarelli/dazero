/**
 * `insert_row` e `update_row` — SCRITTURA DIRETTA DEL DATABASE, COI PERMESSI DELL'UTENTE E DI
 * NESSUN ALTRO. Il gemello in lettura è `query-tool.ts`, e quasi ogni decisione qui è la sua,
 * ripresa perché la coppia sia comprensibile a chi ne conosce uno solo.
 *
 * 1. LO STESSO CANCELLO, E VALE DI PIÙ. La chiave anon più il JWT dell'utente fa valutare la RLS a
 *    Postgres: l'agente non può scrivere niente che l'utente non potrebbe scrivere dall'app. Il
 *    client service-role — coda e percorso a chiave API — è RIFIUTATO, e in scrittura il motivo si
 *    aggrava: con `bypassrls=true` una riga finirebbe in un brand qualunque, non solo letta.
 *
 * 2. LA CANCELLAZIONE NON È RIFIUTATA, È INESPRIMIBILE. Qui non c'è nessuna stringa SQL: si parla
 *    PostgREST (`.from(t).insert()` / `.update()`), e in questo file non esiste `.delete()`, non
 *    esiste `.rpc()`, non esiste `.upsert()` — un test lo verifica leggendo il sorgente. È la
 *    stessa proprietà di `query` girata: là una scrittura non ha un posto dove andare, qui una
 *    cancellazione. Le tredici cancellazioni restano tool espliciti, dove si vedono, perché
 *    l'asimmetria non la toglie nessuna difesa: una lettura sbagliata restituisce dati sbagliati,
 *    una scrittura sbagliata distrugge i tuoi.
 *
 * 3. NIENTE UPSERT, E NON È UNA DIMENTICANZA. Un `onConflict` ha due facce (LESSONS.md): o non
 *    scrive niente — 42P10 che supabase-js RISOLVE invece di rigettare, e `competitors` riportava
 *    successo scrivendo zero righe — o sovrascrive una riga che c'era, quando la coppia unica vera
 *    è diversa da quella che hai in testa. La prima faccia si chiude verificando la chiave contro
 *    `pg_indexes`; la seconda NO: la chiave può essere reale e non essere quella che intendevi, e
 *    allora l'insert diventa una sostituzione — cioè esattamente ciò che `destructiveHint: false`
 *    su `insert_row` giurerebbe di non fare. Il giro in più (23505 che nomina la chiave, poi
 *    `update_row` su quella chiave) rende la sostituzione SCELTA invece che scoperta.
 *
 * 4. IL FILTRO DEL BRAND VALE IL DOPPIO. `query` lo aggiunge quando manca: in lettura una
 *    dimenticanza restituisce troppo. Qui mette la riga nel brand sbagliato, quindi su `insert_row`
 *    un `brand_id` diverso da quello della conversazione è un RIFIUTO e non una correzione muta —
 *    correggerlo direbbe «fatto» a chi credeva di scrivere altrove.
 *
 * 5. UN RIFIUTO DEVE DIRE COSA SI PUÒ FARE. Uno SQLSTATE nudo è un giro sprecato: 23514 nomina il
 *    vincolo e i valori che ammette, 23505 la chiave su cui hai colliso, 42501 distingue il grant
 *    per colonna (e le elenca) dalla RLS (che è una riga di un altro, e non si aggira). Vincoli e
 *    grant vengono da `write-rules.ts`, generato dalle migrazioni.
 */
import { QUERY_TABLES, UPDATE_MAX_ROWS, DELETE_MAX_ROWS } from '@anomalia/api-contracts';
import { TABLE_CHECKS, WRITABLE_COLUMNS } from '@anomalia/api-contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRlsScoped } from '$lib/server/rls-client';
import { logAiCall } from '$lib/server/ai-log';
import { swallow } from '$lib/server/swallow';
import { STORAGE_REFS, pathsInRow, refKey, type StorageRef } from '$lib/server/storage-refs';

export { UPDATE_MAX_ROWS, DELETE_MAX_ROWS };

/** Il guinzaglio sulla connessione HTTP. Il database molla da solo prima (8s sul ruolo). */
export const WRITE_ABORT_MS = 12_000;

/** Lo stesso identificatore non virgolettato che accetta `query`: qui non entra nessun SQL. */
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

const TABLES = new Set(QUERY_TABLES.split(' '));

const CONSTRAINT_NAME = /violates check constraint "([^"]+)"/;
const UNIQUE_NAME = /violates unique constraint "([^"]+)"/;

export const NO_SESSION_WRITE_ERROR = {
  error: 'no_user_session',
  message:
    '`insert_row` and `update_row` write the database AS THIS USER: anon key + their JWT, so Postgres RLS lets the agent write exactly where the user could and nowhere else. This client is not user-scoped — it is a background/queue turn or a CLI API-key request, and both hold a service-role client (`bypassrls=true`) that would write into ANY brand in the database. Refusing to write with it, and refusing harder than the read does: a read with the wrong client returns rows that are not yours, a write leaves them behind.',
  fix: 'Use this surface\'s own write tools — each one scopes to this brand by construction. Or come back as yourself: these write wherever the caller carries their own session — the app, `anomalia login`, and MCP.'
} as const;

type Filter = {
  column: string;
  op: string;
  value: string | number | boolean | null | Array<string | number>;
  negate?: boolean;
};

/**
 * «Questa tabella non ha `brand_id`», detto in un posto solo. Postgres e PostgREST lo dicono con
 * due codici diversi e due frasi diverse — 42703 quando il nome sta in un filtro, PGRST204 quando
 * sta nel corpo di una scrittura, perché lì la colonna la cerca la schema cache — e la regola
 * scritta due volte è diventata subito una regola divergente: l'insert conosceva solo il primo, e
 * su `profiles` moriva dicendo che `brand_id` non esiste invece di riprovare senza.
 */
function missesBrandColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code !== '42703' && error.code !== 'PGRST204') return false;
  return String(error.message ?? '').includes('brand_id');
}

function wireValue(op: string, value: Filter['value']): string {
  if (op === 'in') {
    const items = Array.isArray(value) ? value : [value as string | number];
    return `(${items.map((v) => String(v)).join(',')})`;
  }
  if (value === null) return 'null';
  return String(value);
}

/**
 * Il 42501 ha due cause che si scrivono uguali e si riparano al contrario: un grant per colonna
 * («questa colonna la decide il sistema, quest'altra tu») e la RLS («questa riga non è tua»).
 * Il messaggio di Postgres è l'unica cosa che le distingue, e sceglierne una a caso manda il
 * modello a riprovare dove non c'è niente da riprovare.
 */
function explainDenied(message: string, table: string): string {
  if (message.includes('row-level security')) {
    return `RLS refused this row: this user is not allowed to own it — wrong brand, wrong organisation, or a table only the system writes. There is nothing to retry. Read ${table} with \`query\` to see which rows are reachable at all.`;
  }

  const grant = WRITABLE_COLUMNS[table];
  if (!grant) {
    return `Postgres denied the write on ${table} for this role. There is no way around it from here.`;
  }

  return `Column grants on ${table}: this user may insert [${grant.insert.join(', ') || 'nothing'}] and update [${grant.update.join(', ') || 'nothing'}]. Every other column of that table is decided by the system — billing, approval and cron cursors live there — and no retry changes it.`;
}

export function explainWriteError(
  code: string | undefined,
  message: string,
  details: string | null | undefined,
  table: string
): string {
  switch (code) {
    case '23514': {
      const name = CONSTRAINT_NAME.exec(message)?.[1] ?? '';
      const definition = TABLE_CHECKS[name];
      return definition
        ? `Constraint ${name} allows only: ${definition}. Send a value that satisfies it.`
        : `A CHECK constraint (${name || 'unnamed'}) refused this value. Read one existing row of ${table} with \`query\` to see what shape the column really takes.`;
    }
    // `details` porta «Key (brand_id, title)=(…) already exists» quando c'è, e spesso NON c'è:
    // allora le colonne le dice il nome del vincolo, che non manca mai.
    case '23505':
      return `${details ? details + ' ' : ''}That row is already there, and nothing was replaced — on purpose. The unique key is ${UNIQUE_NAME.exec(message)?.[1] ?? 'the one named in the message'}: change the existing row with update_row filtering on those columns, or send values that do not collide.`;
    case '23502':
      return `${message} That column has no default: send it, or the row cannot exist.`;
    case '23503':
      return `${details ? details + ' ' : ''}A foreign key points at a row that does not exist. Read the parent table with \`query\` and use an id it really has.`;
    case '42501':
      return explainDenied(message, table);
    case '22P02':
    case '22007':
      return `A value has the wrong type for its column. Read one row of ${table} with \`query\`: the values you get back show the shape each column takes.`;
    case '57014':
      return 'The database gave up: statement_timeout is 8s on this role. Narrow the filter so fewer rows are touched.';
    case 'PGRST205':
      return `No table called ${table}. Call \`query\` with no table to list every name.`;
    default:
      return `Unrecognized database error. Read one row of ${table} with \`query\` — its keys are the columns, its values the shapes. Raw: ${message}`;
  }
}

/**
 * La regola di questa tabella, se il registro ne conosce una. Una tabella può referenziare due
 * bucket (`market_posts` lo fa), e allora vengono tolti i file di entrambi.
 */
const refsFor = (table: string): StorageRef[] | null => {
  const rules = STORAGE_REFS.filter((r) => r.table === table);
  return rules.length ? rules : null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilterFn = (q: any, withBrand: boolean) => any;

const columnsOfRules = (rules: StorageRef[]): string[] => [...new Set(rules.flatMap((r) => r.columns))];

/** I path che le righe in partenza tengono in vita, letti finché quelle righe esistono. */
async function pathsHeldBy(
  supabase: SupabaseClient,
  rules: StorageRef[],
  filtered: FilterFn,
  withBrand: boolean
): Promise<Array<{ bucket: string; path: string }>> {
  const columns = ['id', ...columnsOfRules(rules)].join(', ');

  const { data, error } = await filtered(supabase.from(rules[0].table).select(columns), withBrand)
    .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS))
    .then((r: { data: unknown; error: unknown }) => r);

  // Una lettura fallita significa «non so quali file»: si prosegue con la cancellazione delle righe
  // e non si tocca niente nello Storage. Indovinare qui è l'unico modo di cancellare un file vivo.
  if (error || !Array.isArray(data)) return [];

  const held = new Map<string, { bucket: string; path: string }>();
  for (const row of data as Array<Record<string, unknown>>) {
    for (const rule of rules) {
      for (const ref of pathsInRow(rule, row)) {
        held.set(refKey(ref.bucket, ref.path), ref);
      }
    }
  }

  return [...held.values()];
}

/**
 * Toglie i file che NESSUNA riga superstite nomina più. Il secondo giro non è pedanteria: lo stesso
 * file può stare nelle `images` di due persone — una foto di gruppo, un'immagine riusata — e
 * cancellarlo con la prima romperebbe la seconda, che è viva e visibile.
 */
async function removeUnheld(
  supabase: SupabaseClient,
  rules: StorageRef[],
  held: Array<{ bucket: string; path: string }>
): Promise<number> {
  if (!held.length) return 0;

  const stillHeld = new Set<string>();
  for (const rule of rules) {
    const { data } = await supabase
      .from(rule.table)
      .select(rule.columns.join(', '))
      .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      for (const ref of pathsInRow(rule, row)) {
        stillHeld.add(refKey(ref.bucket, ref.path));
      }
    }
  }

  const doomed = held.filter((ref) => !stillHeld.has(refKey(ref.bucket, ref.path)));
  if (!doomed.length) return 0;

  const byBucket = new Map<string, string[]>();
  for (const ref of doomed) {
    byBucket.set(ref.bucket, [...(byBucket.get(ref.bucket) ?? []), ref.path]);
  }

  let removed = 0;
  for (const [bucket, paths] of byBucket) {
    // Lo Storage che non risponde NON trasforma una cancellazione riuscita in un errore: le righe
    // sono già sparite, e dire «fallito» manderebbe l'agente a ritentare una DELETE che non trova
    // più niente da togliere.
    try {
      await supabase.storage.from(bucket).remove(paths);
      removed += paths.length;
    } catch (error) {
      swallow('remove orphaned files', error);
    }
  }

  return removed;
}

export type WriteToolDeps = {
  supabase: SupabaseClient;
  brandId: string;
  userId?: string;
  threadId?: string;
};

type InsertInput = { table: string; values: Record<string, unknown> };
type UpdateInput = { table: string; where: Filter[]; values: Record<string, unknown> };

type Refusal = { error: string; message: string; fix?: string };

function badIdentifier(table: string, values: Record<string, unknown>, where: Filter[]): Refusal | null {
  if (!IDENT.test(table.trim())) {
    return {
      error: 'not_an_identifier',
      message: `"${table}" is not a table name. There is no SQL here — no statement, no CTE, no function call — so a DELETE or a DROP has nowhere to go. Give a bare table name.`,
      fix: 'Call `query` with no table to see the valid names.'
    };
  }

  const column = [...Object.keys(values), ...where.map((f) => String(f.column))].find(
    (c) => !IDENT.test(String(c).trim())
  );
  if (column !== undefined) {
    return {
      error: 'not_an_identifier',
      message: `"${column}" is not a column name. Columns are bare identifiers — no expressions, no functions, no SQL.`,
      fix: `Call query({ table: "${table}" }) with no columns to see what this table actually has.`
    };
  }

  if (!TABLES.has(table.trim())) {
    return {
      error: 'unknown_table',
      message: `No table "${table}" is created by any migration, so it does not exist in a fresh install even if production happens to have one.`,
      fix: 'Call `query` with no table to list every name you can write to.'
    };
  }

  return null;
}

export function createWriteTools({ supabase, brandId, userId, threadId }: WriteToolDeps) {
  const finish = <T extends Record<string, unknown>>(out: T, note: string, t0: number): T => {
    logAiCall({
      label: 'db_write',
      provider: 'internal',
      ms: Date.now() - t0,
      ok: !('error' in out),
      error: 'error' in out ? String(out.error) : undefined,
      context: note.slice(0, 400),
      brandId,
      userId: userId || undefined,
      threadId
    });
    return out;
  };

  /**
   * Lo schema non si spiega, si va a prendere: una riga con tutte le colonne È lo schema. E qui,
   * al contrario di `query`, la scrittura NON si rifà con i nomi giusti — indovinare una colonna
   * per conto di chi scrive è mettere in tabella un valore che nessuno ha chiesto.
   */
  const columnsOf = async (table: string): Promise<string[]> => {
    const probe = await supabase.from(table).select('*').limit(1).abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));
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
          ? `A column you named does not exist on ${table}, and the write was NOT retried with a guess — that is the difference between a read and a write. Real columns: ${available.join(', ')}.`
          : explainWriteError(error.code, error.message, error.details, table),
        ...(available.length ? { columns_available: available } : {})
      },
      note,
      t0
    );
  };

  const insertRow = async (input: InsertInput) => {
    const t0 = Date.now();
    const values = input.values ?? {};

    if (!isRlsScoped(supabase)) return finish({ ...NO_SESSION_WRITE_ERROR }, 'db_write:refused:no_session', t0);

    const refusal = badIdentifier(input.table, values, []);
    if (refusal) return finish(refusal, `db_write:refused:${refusal.error}`, t0);

    if (!Object.keys(values).length) {
      return finish(
        {
          error: 'no_values',
          message: 'An insert with no columns is an empty row, not a row.',
          fix: `Read one row of ${input.table} with \`query\` and send the columns that matter.`
        },
        'db_write:refused:no_values',
        t0
      );
    }

    // Il brand SI IMPONE, e uno diverso è un rifiuto: correggerlo in silenzio direbbe «fatto» a
    // chi credeva di scrivere altrove, ed è un errore che si scopre solo leggendo la tabella dopo.
    const named = values.brand_id;
    if (named !== undefined && named !== null && String(named) !== brandId) {
      return finish(
        {
          error: 'wrong_brand',
          message: `This conversation is brand ${brandId}, and the row names ${String(named)}. Nothing was written and nothing was corrected for you.`,
          fix: `Drop \`brand_id\` — it is filled in with ${brandId} — or open the conversation on the brand you meant.`
        },
        'db_write:refused:wrong_brand',
        t0
      );
    }

    const table = input.table.trim();
    const run = (withBrand: boolean) =>
      supabase
        .from(table)
        .insert(withBrand ? { ...values, brand_id: brandId } : values)
        .select()
        .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    let { data, error } = await run(true);
    if (missesBrandColumn(error)) ({ data, error } = await run(false));

    if (error) return failed(table, error, `db_write:${table}:insert:err:${error.code ?? '?'}`, t0);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return finish(
      { table, row: rows[0], inserted: rows.length },
      `db_write:${table}:insert:cols=${Object.keys(values).length}`,
      t0
    );
  };

  const updateRow = async (input: UpdateInput) => {
    const t0 = Date.now();
    const values = input.values ?? {};
    const where = input.where ?? [];

    if (!isRlsScoped(supabase)) return finish({ ...NO_SESSION_WRITE_ERROR }, 'db_write:refused:no_session', t0);

    const refusal = badIdentifier(input.table, values, where);
    if (refusal) return finish(refusal, `db_write:refused:${refusal.error}`, t0);

    if (!where.length) {
      return finish(
        {
          error: 'where_required',
          message:
            'An update with no filter rewrites every row this user can reach in that table. That is the deletion this tool does not expose, wearing a different name.',
          fix: 'Name the rows: where: [{ column: "id", op: "eq", value: "<the id>" }]. Read them with `query` first if you are not sure which ones you mean.'
        },
        'db_write:refused:where_required',
        t0
      );
    }

    if (!Object.keys(values).length) {
      return finish(
        {
          error: 'no_values',
          message: 'An update with no columns changes nothing and would still report success.',
          fix: 'Send the columns you want to change. The ones you leave out are not touched.'
        },
        'db_write:refused:no_values',
        t0
      );
    }

    const table = input.table.trim();
    const brandNamed = where.some((f) => String(f.column).trim() === 'brand_id');

    // `negate` non è un dettaglio del gemello in lettura da ricopiare per simmetria: ignorarlo qui
    // sceglierebbe l'insieme COMPLEMENTARE di righe, e le scriverebbe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Filterable = { filter: (c: string, o: string, v: string) => any; not: (c: string, o: string, v: string) => any };
    const filtered = <T extends Filterable>(q: T, withBrand: boolean) => {
      let out = q;
      for (const f of where) {
        const column = String(f.column).trim();
        const value = wireValue(f.op, f.value);
        out = f.negate ? out.not(column, f.op, value) : out.filter(column, f.op, value);
      }
      if (withBrand) out = out.filter('brand_id', 'eq', brandId);
      return out;
    };

    // SI CONTA PRIMA DI SCRIVERE. PostgREST non sa mettere un LIMIT su un update, quindi il tetto
    // o vive qui o non esiste — e senza, un filtro largo è la stessa riga di codice di un filtro
    // stretto. Il conteggio è anche l'unico modo di distinguere «zero righe» da «scritto»: un
    // update che non trova niente risponde 200 con l'array vuoto.
    //
    // E NON si chiede `head: true`, che sarebbe la forma ovvia: senza corpo nella risposta non
    // torna nemmeno il corpo dell'ERRORE, e supabase-js consegna `{ message: '', code: undefined }`.
    // Un rifiuto che non si riconosce è peggio di uno SQLSTATE nudo. Una riga sola di traffico è il
    // prezzo del messaggio.
    let withBrand = !brandNamed;
    const counted = async () =>
      filtered(supabase.from(table).select('*', { count: 'exact' }), withBrand)
        .limit(1)
        .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    let count = await counted();
    if (withBrand && missesBrandColumn(count.error)) {
      withBrand = false;
      count = await counted();
    }

    if (count.error) return failed(table, count.error, `db_write:${table}:count:err:${count.error.code ?? '?'}`, t0);

    const matched = count.count ?? 0;
    if (matched === 0) {
      return finish(
        {
          error: 'no_rows_matched',
          message: `No row of ${table} matches that filter inside this brand, so nothing was written.`,
          fix: 'Read the rows with `query` using the same filter: either the id is wrong, or the row belongs to another brand and RLS hides it.',
          matched: 0
        },
        `db_write:${table}:update:no_rows`,
        t0
      );
    }

    if (matched > UPDATE_MAX_ROWS) {
      return finish(
        {
          error: 'too_many_rows',
          message: `That filter matches ${matched} rows and the ceiling is ${UPDATE_MAX_ROWS}. Nothing was written.`,
          fix: 'Narrow the filter, or change the rows in batches by adding a filter that splits them.',
          matched
        },
        `db_write:${table}:update:too_many:${matched}`,
        t0
      );
    }

    const written = await filtered(supabase.from(table).update(values), withBrand)
      .select()
      .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    if (written.error) {
      return failed(table, written.error, `db_write:${table}:update:err:${written.error.code ?? '?'}`, t0);
    }

    const rows = (written.data ?? []) as Array<Record<string, unknown>>;
    return finish(
      {
        table,
        rows,
        updated: rows.length,
        matched,
        note: `Only ${Object.keys(values).join(', ')} changed — every other column of those rows is untouched.`
      },
      `db_write:${table}:update:rows=${rows.length}/${matched}`,
      t0
    );
  };

  /**
   * CANCELLARE, con il tetto più basso di tutti e il rifiuto INTERO.
   *
   * Condivide con l'update le tre guardie che contano — sessione dell'utente, identificatori,
   * filtro obbligatorio — e cambia dove il danno cambia: il tetto è `DELETE_MAX_ROWS` e non
   * `UPDATE_MAX_ROWS`, perché un update sbagliato si riscrive quando si sa cosa c'era prima, e
   * una riga tolta non torna.
   *
   * IL RIFIUTO È INTERO, mai parziale: PostgREST non sa mettere un LIMIT su una DELETE, quindi
   * togliere «le prime dieci» di un filtro che ne prende venti lascerebbe dieci righe vive scelte
   * da un ordine che nessuno ha chiesto — e nessuno saprebbe quali. Si conta prima, e oltre il
   * tetto non si tocca niente.
   */
  const deleteRow = async (input: { table: string; where?: Filter[] }) => {
    const t0 = Date.now();
    const where = input.where ?? [];

    if (!isRlsScoped(supabase)) return finish({ ...NO_SESSION_WRITE_ERROR }, 'db_write:refused:no_session', t0);

    const refusal = badIdentifier(input.table, {}, where);
    if (refusal) return finish(refusal, `db_write:refused:${refusal.error}`, t0);

    if (!where.length) {
      return finish(
        {
          error: 'where_required',
          message:
            'A delete with no filter empties every row this user can reach in that table, and none of them come back.',
          fix: 'Name the rows: where: [{ column: "id", op: "eq", value: "<the id>" }]. Read them with `query` first — a prefix that looked unambiguous in a list is how the wrong row goes.'
        },
        'db_write:refused:where_required',
        t0
      );
    }

    const table = input.table.trim();
    const brandNamed = where.some((f) => String(f.column).trim() === 'brand_id');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Filterable = { filter: (c: string, o: string, v: string) => any; not: (c: string, o: string, v: string) => any };
    const filtered = <T extends Filterable>(q: T, withBrand: boolean) => {
      let out = q;
      for (const f of where) {
        const column = String(f.column).trim();
        const value = wireValue(f.op, f.value);
        out = f.negate ? out.not(column, f.op, value) : out.filter(column, f.op, value);
      }
      if (withBrand) out = out.filter('brand_id', 'eq', brandId);
      return out;
    };

    let withBrand = !brandNamed;
    const counted = async () =>
      filtered(supabase.from(table).select('*', { count: 'exact' }), withBrand)
        .limit(1)
        .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    let count = await counted();
    if (withBrand && missesBrandColumn(count.error)) {
      withBrand = false;
      count = await counted();
    }

    if (count.error) return failed(table, count.error, `db_write:${table}:count:err:${count.error.code ?? '?'}`, t0);

    const matched = count.count ?? 0;
    if (matched === 0) {
      return finish(
        {
          error: 'no_rows_matched',
          message: `No row of ${table} matches that filter inside this brand, so nothing was removed.`,
          fix: 'Read the rows with `query` using the same filter: either the id is wrong, or the row belongs to another brand and RLS hides it.',
          matched: 0
        },
        `db_write:${table}:delete:no_rows`,
        t0
      );
    }

    if (matched > DELETE_MAX_ROWS) {
      return finish(
        {
          error: 'too_many_rows',
          message: `That filter matches ${matched} rows and the ceiling is ${DELETE_MAX_ROWS}. Nothing was removed.`,
          fix: 'Narrow the filter, or remove them in batches by adding a filter that splits them. Read them with `query` first to see what you are about to lose.',
          matched
        },
        `db_write:${table}:delete:too_many:${matched}`,
        t0
      );
    }

    // I PATH SI LEGGONO ORA, mentre le righe ci sono ancora: dopo la DELETE la riga che li nominava
    // non esiste più, e con lei l'unico modo di sapere quali file teneva in vita.
    const rule = refsFor(table);
    const held = rule ? await pathsHeldBy(supabase, rule, filtered, withBrand) : [];

    const removed = await filtered(supabase.from(table).delete(), withBrand)
      .select()
      .abortSignal(AbortSignal.timeout(WRITE_ABORT_MS));

    if (removed.error) {
      return failed(table, removed.error, `db_write:${table}:delete:err:${removed.error.code ?? '?'}`, t0);
    }

    const rows = (removed.data ?? []) as Array<Record<string, unknown>>;

    // E SI TOLGONO ADESSO, non prima. Il verso opposto sembra più prudente e non lo è: se la DELETE
    // fallisse dopo — RLS, una foreign key, il timeout a 8s — resterebbe una riga VIVA che punta a
    // un file che non c'è più, e l'utente la vede rotta. Un orfano invece non lo vede nessuno: costa
    // spazio, non fiducia. Fra i due danni si sceglie quello reversibile.
    const filesRemoved = rule ? await removeUnheld(supabase, rule, held) : undefined;

    return finish(
      {
        table,
        deleted: rows.length,
        matched,
        ...(filesRemoved === undefined ? {} : { files_removed: filesRemoved }),
        note: 'Gone. Nothing here restores them.'
      },
      `db_write:${table}:delete:rows=${rows.length}/${matched}`,
      t0
    );
  };

  return { insertRow, updateRow, deleteRow };
}
