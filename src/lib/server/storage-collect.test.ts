import { describe, expect, it, vi } from 'vitest';
import { collectOrphans, MAX_REF_ROWS } from './storage-collect';
import { ORPHAN_GRACE_MS } from './storage-refs';

vi.mock('$lib/server/swallow', () => ({ swallow: vi.fn() }));

const NOW = Date.parse('2026-09-21T12:00:00Z');
const OLD = new Date(NOW - ORPHAN_GRACE_MS - 60_000).toISOString();

type Fake = {
  rows?: Record<string, Array<Record<string, unknown>>>;
  objects?: Array<{ name: string; created_at: string; bucket_id: string }>;
  tableError?: string;
  objectsError?: string;
};

/**
 * Il finto PostgREST TRONCA come quello vero: mai più di PAGE righe per richiesta, qualunque
 * intervallo si chieda. Un finto che restituisce tutto in un colpo non può far fallire il difetto
 * che questo file esiste per tenere fuori — è il finto di prima, e non ha visto 1.000.
 */
const PAGE = 1000;

function fakeClient(fake: Fake) {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const pagesAsked: Array<{ source: string; from: number }> = [];
  const ordered = new Set<string>();

  const slice = <T>(all: T[], source: string, from: number, to: number): T[] => {
    pagesAsked.push({ source, from });
    return all.slice(from, Math.min(to + 1, from + PAGE));
  };

  const client = {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        order: (column: string) => {
          ordered.add(`${table}.${column}`);
          return builder;
        },
        range: async (from: number, to: number) =>
          fake.tableError
            ? { data: null, error: { message: fake.tableError } }
            : { data: slice(fake.rows?.[table] ?? [], table, from, to), error: null }
      };
      return builder;
    },
    /**
     * Come il PostgREST vero: `storage` NON è fra gli schemi esposti, e chiedere quello schema è
     * un errore, non una lettura vuota. Il finto di prima lo serviva volentieri, ed è il motivo
     * per cui una suite verde conviveva con un raccoglitore che in produzione falliva sempre.
     */
    schema: (name: string) => {
      throw new Error(`PGRST106: Invalid schema: ${name}`);
    },
    rpc: async (fn: string, args: { p_bucket: string; p_from: number; p_limit: number }) => {
      if (fn !== 'storage_objects_page') throw new Error(`unexpected rpc: ${fn}`);
      if (fake.objectsError) return { data: null, error: { message: fake.objectsError } };

      const all = (fake.objects ?? []).filter((o) => o.bucket_id === args.p_bucket);
      return {
        data: slice(all, `objects:${args.p_bucket}`, args.p_from, args.p_from + args.p_limit - 1),
        error: null
      };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths });
          return { data: null, error: null };
        }
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { client, removed, pagesAsked, ordered };
}

const historyRows = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({ thumbnail_path: `own/b1/history/ref-${i + offset}.jpg` }));

const objectsFor = (paths: string[]) =>
  paths.map((name) => ({ name, created_at: OLD, bucket_id: 'brand-knowledge' }));

const orphanObject = {
  name: 'own/b1/history/abandoned.jpg',
  created_at: OLD,
  bucket_id: 'brand-knowledge'
};

describe('il raccoglitore non cancella se non gli si chiede', () => {
  it('in modalità di partenza dice cosa toglierebbe e non tocca niente', async () => {
    const { client, removed } = fakeClient({ objects: [orphanObject] });

    const out = await collectOrphans(client, { now: NOW });

    expect('error' in out).toBe(false);
    if ('error' in out) return;
    expect(out.mode).toBe('report');
    expect(out.orphans).toBe(1);
    expect(out.sample).toEqual([
      { bucket: 'brand-knowledge', path: 'own/b1/history/abandoned.jpg', area: 'history' }
    ]);
    expect(out.removed).toBe(0);
    expect(removed).toEqual([]);
  });

  it('cancella solo quando la modalità è chiesta per nome', async () => {
    const { client, removed } = fakeClient({ objects: [orphanObject] });

    const out = await collectOrphans(client, { now: NOW, mode: 'collect' });

    if ('error' in out) throw new Error(out.error);
    expect(out.removed).toBe(1);
    expect(removed).toEqual([
      { bucket: 'brand-knowledge', paths: ['own/b1/history/abandoned.jpg'] }
    ]);
  });
});

describe('nessuna delle due letture si ferma alla prima pagina', () => {
  it('l\'inventario conta i file oltre il millesimo invece di troncare il bucket', async () => {
    const paths = Array.from({ length: PAGE + 37 }, (_, i) => `own/b1/history/file-${i}.jpg`);
    const { client } = fakeClient({ objects: objectsFor(paths) });

    const out = await collectOrphans(client, { now: NOW });

    if ('error' in out) throw new Error(out.error);
    expect(out.scanned).toBe(PAGE + 37);
  });

  it('un riferimento letto solo alla seconda pagina salva il suo file', async () => {
    const saved = `own/b1/history/ref-${PAGE}.jpg`;
    const { client, removed } = fakeClient({
      rows: { social_post_history: historyRows(PAGE + 1) },
      objects: objectsFor([saved])
    });

    const out = await collectOrphans(client, { now: NOW, mode: 'collect' });

    if ('error' in out) throw new Error(out.error);
    expect(out.orphans).toBe(0);
    expect(out.referenced).toBe(1);
    expect(removed).toEqual([]);
  });

  it('chiede ogni pagina con un ordine totale, o due pagine possono saltare una riga', async () => {
    const { client, ordered } = fakeClient({ rows: { social_post_history: historyRows(PAGE + 1) } });

    await collectOrphans(client, { now: NOW });

    expect(ordered.has('social_post_history.id')).toBe(true);
  });

  it('ordina con la chiave che la tabella ha davvero, non con un `id` sperato', async () => {
    const { client, ordered } = fakeClient({});

    await collectOrphans(client, { now: NOW });

    expect(ordered.has('social_thumb_cache.platform')).toBe(true);
    expect(ordered.has('social_thumb_cache.handle')).toBe(true);
    expect(ordered.has('social_thumb_cache.id')).toBe(false);
  });

  it('legge l\'inventario da una funzione di `public`, non dallo schema `storage`', async () => {
    const { client, pagesAsked } = fakeClient({ objects: objectsFor(['own/b1/history/a.jpg']) });

    const out = await collectOrphans(client, { now: NOW });

    if ('error' in out) throw new Error(out.error);
    expect(out.scanned).toBe(1);
    expect(pagesAsked.some((p) => p.source === 'objects:brand-knowledge')).toBe(true);
  });
});

describe('una lettura incompleta ferma il giro invece di restringerlo', () => {
  it('un elenco di riferimenti che non finisce fa fallire il giro, non lo restringe', async () => {
    const { client, removed } = fakeClient({
      rows: { social_post_history: historyRows(MAX_REF_ROWS + 1) },
      objects: objectsFor(['own/b1/history/abandoned.jpg'])
    });

    const out = await collectOrphans(client, { now: NOW, mode: 'collect' });

    expect('error' in out).toBe(true);
    expect(removed).toEqual([]);
  });
});

describe('una lettura interrotta ferma il giro invece di restringerlo', () => {
  it('una tabella di riferimenti che non risponde non produce nessun orfano', async () => {
    const { client, removed } = fakeClient({ objects: [orphanObject], tableError: 'timeout' });

    const out = await collectOrphans(client, { now: NOW, mode: 'collect' });

    expect('error' in out).toBe(true);
    expect(removed).toEqual([]);
  });

  it('un inventario che non si legge non produce nessun orfano', async () => {
    const { client, removed } = fakeClient({ objects: [orphanObject], objectsError: 'denied' });

    const out = await collectOrphans(client, { now: NOW, mode: 'collect' });

    expect('error' in out).toBe(true);
    expect(removed).toEqual([]);
  });
});

describe('quel che il raccoglitore dichiara di NON sapere', () => {
  it('non elenca né tocca un file di un\'area fuori portata', async () => {
    const { client, removed } = fakeClient({
      objects: [
        { name: 'own/b1/competitors/x.jpg', created_at: OLD, bucket_id: 'brand-knowledge' },
        { name: 'own/b1/mood/y.jpg', created_at: OLD, bucket_id: 'brand-knowledge' }
      ]
    });

    const out = await collectOrphans(client, { now: NOW, mode: 'collect' });

    if ('error' in out) throw new Error(out.error);
    expect(out.orphans).toBe(0);
    expect(out.out_of_scope).toBe(2);
    expect(removed).toEqual([]);
  });

  it('un file referenziato da una riga viva non è mai proposto', async () => {
    const { client, removed } = fakeClient({
      objects: [orphanObject],
      rows: { social_post_history: [{ thumbnail_path: 'own/b1/history/abandoned.jpg' }] }
    });

    const out = await collectOrphans(client, { now: NOW, mode: 'collect' });

    if ('error' in out) throw new Error(out.error);
    expect(out.orphans).toBe(0);
    expect(out.referenced).toBe(1);
    expect(removed).toEqual([]);
  });

  it('il report dice su quali aree sa ragionare', async () => {
    const { client } = fakeClient({});

    const out = await collectOrphans(client, { now: NOW });

    if ('error' in out) throw new Error(out.error);
    expect(out.covered_areas).toContain('brand-knowledge/history');
    expect(out.covered_areas).not.toContain('brand-knowledge/competitors');
    expect(out.grace_hours).toBe(24);
  });
});
