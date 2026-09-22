import { describe, expect, it, vi } from 'vitest';
import type { Db } from '$lib/server/db/client';
import { uploadCanvasAsset } from './upload';

const scope = { orgId: 'org', projectId: 'project', canvasId: 'canvas', userId: 'user', x: 10, y: 20 };

function storageDb() {
  const objects = new Set<string>();
  const storage = {
    upload: vi.fn(async (path: string) => { objects.add(path); return { error: null }; }),
    remove: vi.fn(async (paths: string[]) => { paths.forEach((path) => objects.delete(path)); return { error: null }; })
  };
  const from = vi.fn(() => ({
    insert: () => ({ select: () => ({ single: async () => ({ data: null, error: new Error('database unavailable') }) }) })
  }));
  return { objects, storage, db: { storage: { from: () => storage }, from } as unknown as Db, from };
}

describe('canvas uploads', () => {
  it('rejects executable documents before storing anything', async () => {
    const { db, storage, from } = storageDb();
    await expect(uploadCanvasAsset(db, { ...scope, file: new File(['<script>'], 'page.html', { type: 'text/html' }) }))
      .rejects.toMatchObject({ status: 400 });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('removes the uploaded object when the asset cannot be saved', async () => {
    const { db, objects, storage } = storageDb();
    await expect(uploadCanvasAsset(db, { ...scope, file: new File(['hello'], 'note.txt', { type: 'text/plain' }) }))
      .rejects.toThrow('database unavailable');
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(objects.size).toBe(0);
  });
});
