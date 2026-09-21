import { describe, expect, it, vi } from 'vitest';
import { collectOrphans } from './storage-collect';
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

function fakeClient(fake: Fake) {
  const removed: Array<{ bucket: string; paths: string[] }> = [];

  const client = {
    from: (table: string) => ({
      select: () => ({
        range: async () =>
          fake.tableError
            ? { data: null, error: { message: fake.tableError } }
            : { data: fake.rows?.[table] ?? [], error: null }
      })
    }),
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: async (_c: string, bucket: string) =>
            fake.objectsError
              ? { data: null, error: { message: fake.objectsError } }
              : { data: (fake.objects ?? []).filter((o) => o.bucket_id === bucket), error: null }
        })
      })
    }),
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

  return { client, removed };
}

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

describe('una lettura incompleta ferma il giro invece di restringerlo', () => {
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
