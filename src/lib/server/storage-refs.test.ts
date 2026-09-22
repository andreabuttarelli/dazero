import { describe, expect, it } from 'vitest';
import {
  STORAGE_REFS,
  COLLECTABLE_AREAS,
  ORPHAN_GRACE_MS,
  COLLECT_MAX_FILES,
  pathsInRow,
  areaOf,
  orphansAmong
} from './storage-refs';

describe('il registro delle dipendenze riga → file', () => {
  it('estrae un path nudo dalla colonna che lo contiene', () => {
    const rule = STORAGE_REFS.find((r) => r.table === 'social_post_history');
    expect(pathsInRow(rule!, { thumbnail_path: 'o/b/history/a.jpg' })).toEqual([
      { bucket: 'brand-knowledge', path: 'o/b/history/a.jpg' }
    ]);
  });

  it('cammina un array jsonb invece di stringere la colonna', () => {
    const rule = STORAGE_REFS.find((r) => r.table === 'social_thumb_cache');
    expect(pathsInRow(rule!, { paths: ['o/b/history/1.jpg', 'o/b/history/2.jpg'] })).toEqual([
      { bucket: 'brand-knowledge', path: 'o/b/history/1.jpg' },
      { bucket: 'brand-knowledge', path: 'o/b/history/2.jpg' }
    ]);
  });

  it('non inventa un path da una colonna vuota o di forma sbagliata', () => {
    const rule = STORAGE_REFS.find((r) => r.table === 'social_thumb_cache');
    expect(pathsInRow(rule!, { paths: null })).toEqual([]);
    expect(pathsInRow(rule!, { paths: 'not-an-array' })).toEqual([]);
    expect(pathsInRow(rule!, {})).toEqual([]);
  });

  it('`brand_media` tiene lo stesso path in due colonne e non lo conta due volte', () => {
    const rule = STORAGE_REFS.find((r) => r.table === 'brand_media');
    const out = pathsInRow(rule!, { storage_path: 'o/b/media/x.png', url: 'o/b/media/x.png' });
    expect(out).toEqual([{ bucket: 'brand-knowledge', path: 'o/b/media/x.png' }]);
  });

  it('scarta un URL pubblico dove la regola dichiara un path nudo', () => {
    const rule = STORAGE_REFS.find((r) => r.table === 'brand_media');
    expect(pathsInRow(rule!, { storage_path: 'https://x.supabase.co/storage/v1/object/public/media/a.png' })).toEqual(
      []
    );
  });

  it('la chiave del registro è tabella+bucket, e non si ripete', () => {
    const keys = STORAGE_REFS.map((r) => `${r.table}/${r.bucket}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ogni regola dichiara con quali colonne si ordina, o non si può paginare', () => {
    for (const rule of STORAGE_REFS) {
      expect(rule.orderBy.length, rule.table).toBeGreaterThan(0);
      for (const column of rule.orderBy) expect(column, rule.table).toMatch(/^[a-z_]+$/);
    }
  });

  it('`social_thumb_cache` non ha `id`: si ordina sulla sua chiave vera', () => {
    const rule = STORAGE_REFS.find((r) => r.table === 'social_thumb_cache');
    expect(rule!.orderBy).toEqual(['platform', 'handle']);
  });

  it('una tabella può referenziare due bucket, e resta una regola per bucket', () => {
    const market = STORAGE_REFS.filter((r) => r.table === 'market_posts');
    expect(market.map((r) => r.bucket).sort()).toEqual(['brand-knowledge', 'wall']);
  });
});

describe('l\'area di un path, e il recinto di quelle raccoglibili', () => {
  it.each([
    ['brand-knowledge', 'own/brand/history/a.jpg', 'history'],
    ['brand-knowledge', 'own/brand/media/a.png', 'media'],
    ['brand-knowledge', 'own/brand/artifacts/a.pdf', 'artifacts'],
    ['brand-knowledge', 'market/tiktok/abc.mp4', 'market'],
    ['wall', 'tiktok/abc.webp', 'wall']
  ])('%s/%s è area %s', (bucket, path, area) => {
    expect(areaOf(bucket, path)).toBe(area);
  });

  it('un path che non corrisponde a nessuna area dichiarata non ne prende una a caso', () => {
    expect(areaOf('brand-knowledge', 'own/brand/competitors/a.jpg')).toBe(null);
    expect(areaOf('brand-knowledge', 'own/brand/mood/a.jpg')).toBe(null);
    expect(areaOf('media', 'user/library/a.png')).toBe(null);
    expect(areaOf('email-assets', 'trends/a.png')).toBe(null);
    expect(areaOf('agent-docs', 'defaults/x.md')).toBe(null);
    expect(areaOf('brand-knowledge', 'due/segmenti.jpg')).toBe(null);
  });

  it('ogni area raccoglibile nomina almeno una regola che la referenzia', () => {
    for (const area of COLLECTABLE_AREAS) {
      const covering = STORAGE_REFS.filter((r) => r.areas.includes(area.area));
      expect(covering.length).toBeGreaterThan(0);
    }
  });
});

describe('orphansAmong — la parte che decide cosa muore', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');
  const old = new Date(now - ORPHAN_GRACE_MS - 1000).toISOString();
  const fresh = new Date(now - 1000).toISOString();

  it('un file REFERENZIATO non viene mai proposto, quanto vecchio sia', () => {
    const out = orphansAmong({
      now,
      files: [{ bucket: 'brand-knowledge', path: 'o/b/history/a.jpg', createdAt: old }],
      referenced: new Set(['brand-knowledge\u0000o/b/history/a.jpg'])
    });
    expect(out.orphans).toEqual([]);
    expect(out.referenced).toBe(1);
  });

  it('un file non referenziato ma dentro il periodo di grazia è risparmiato', () => {
    const out = orphansAmong({
      now,
      files: [{ bucket: 'brand-knowledge', path: 'o/b/history/a.jpg', createdAt: fresh }],
      referenced: new Set()
    });
    expect(out.orphans).toEqual([]);
    expect(out.tooYoung).toBe(1);
  });

  it('un file in un\'area NON coperta è ignorato anche se nessuna riga lo nomina', () => {
    const out = orphansAmong({
      now,
      files: [
        { bucket: 'brand-knowledge', path: 'o/b/competitors/a.jpg', createdAt: old },
        { bucket: 'email-assets', path: 'trends/a.png', createdAt: old },
        { bucket: 'agent-docs', path: 'overrides/x.md', createdAt: old }
      ],
      referenced: new Set()
    });
    expect(out.orphans).toEqual([]);
    expect(out.outOfScope).toBe(3);
  });

  it('propone un file vecchio, scoperto e non referenziato', () => {
    const out = orphansAmong({
      now,
      files: [{ bucket: 'brand-knowledge', path: 'o/b/history/a.jpg', createdAt: old }],
      referenced: new Set()
    });
    expect(out.orphans).toEqual([{ bucket: 'brand-knowledge', path: 'o/b/history/a.jpg', area: 'history' }]);
  });

  it('non propone più di COLLECT_MAX_FILES, e dice quanti ne restano', () => {
    const files = Array.from({ length: COLLECT_MAX_FILES + 7 }, (_, i) => ({
      bucket: 'brand-knowledge',
      path: `o/b/history/${i}.jpg`,
      createdAt: old
    }));
    const out = orphansAmong({ now, files, referenced: new Set() });
    expect(out.orphans.length).toBe(COLLECT_MAX_FILES);
    expect(out.capped).toBe(7);
  });

  it('un path referenziato in un ALTRO bucket non salva l\'omonimo', () => {
    const out = orphansAmong({
      now,
      files: [{ bucket: 'brand-knowledge', path: 'o/b/history/a.jpg', createdAt: old }],
      referenced: new Set(['media\u0000o/b/history/a.jpg'])
    });
    expect(out.orphans.length).toBe(1);
  });
});
