import { describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db/client';
import { signMediaPaths } from './sign-media';

function storageWith(buckets: Record<string, string[]>): Db {
  return {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({
            path,
            signedUrl: (buckets[bucket] ?? []).includes(path) ? `https://signed/${bucket}/${path}` : null
          }))
        })
      })
    }
  } as unknown as Db;
}

describe('un file in Storage arriva al modello come URL firmato, non come percorso', () => {
  it('firma un render dal bucket dei render e un upload dal bucket della tela, nello stesso ordine', async () => {
    const db = storageWith({ 'brand-knowledge': ['u/media/generated.png'], 'canvas-assets': ['o/p/upload.png'] });

    const urls = await signMediaPaths(db, ['u/media/generated.png', 'o/p/upload.png']);

    expect(urls).toEqual(['https://signed/brand-knowledge/u/media/generated.png', 'https://signed/canvas-assets/o/p/upload.png']);
  });

  it('lascia com\'è un URL già assoluto e scarta un percorso che nessun bucket conosce', async () => {
    const db = storageWith({});

    const urls = await signMediaPaths(db, ['https://cdn.example/x.png', 'missing/path.png']);

    expect(urls).toEqual(['https://cdn.example/x.png']);
  });
});
