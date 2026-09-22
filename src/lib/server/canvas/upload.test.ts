import { describe, expect, it, vi } from 'vitest';
import type { Db } from '$lib/server/db/client';
import { registerCanvasUpload, UploadError } from './upload';

const scope = { orgId: 'org', projectId: 'project', canvasId: 'canvas', x: 10, y: 20 };
const path = 'org/project/file.png';

function storageDb(overrides: { download?: () => Promise<{ data: Blob | null; error: Error | null }> } = {}) {
  const removed: string[] = [];
  const storage = {
    remove: vi.fn(async (paths: string[]) => { removed.push(...paths); return { error: null }; }),
    download: overrides.download ?? (async () => ({ data: null, error: new Error('non usato') }))
  };

  const inserted: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  const assetRow = { id: 'asset-1', project_id: scope.projectId, type: 'image', url: path, content: null,
    mime_type: 'image/png', bytes: 100, width: null, height: null, duration_s: null,
    source: 'upload', source_node_id: null, created_at: 'now' };

  const from = vi.fn((table: string) => {
    if (table === 'assets') {
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: assetRow, error: null }) }) };
        },
        delete: () => ({ eq: () => ({ eq: async () => { deleted.push('assets'); return { error: null }; } }) })
      };
    }
    if (table === 'nodes') {
      return {
        insert: (row: Record<string, unknown>) => {
          const nodeRow = { id: 'node-1', canvas_id: scope.canvasId, project_id: scope.projectId, type: row.type,
            display_name: null, x: scope.x, y: scope.y, z: 0, width: null, height: null, data: row.data ?? {}, version: 1 };
          return { select: () => ({ single: async () => ({ data: nodeRow, error: null }) }) };
        }
      };
    }
    if (table === 'canvas_events') {
      return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'event-1' }, error: null }) }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    removed,
    inserted,
    deleted,
    db: { storage: { from: () => storage }, from } as unknown as Db
  };
}

describe('registrare un upload già in storage', () => {
  it('rifiuta un percorso fuori dalla cartella dell\'org', async () => {
    const { db } = storageDb();
    await expect(
      registerCanvasUpload(db, { ...scope, path: 'altra-org/file.png', fileName: 'file.png', mimeType: 'image/png', bytes: 100 })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rifiuta un formato che non è né immagine né video né documento', async () => {
    const { db } = storageDb();
    await expect(
      registerCanvasUpload(db, { ...scope, path, fileName: 'virus.exe', mimeType: 'application/x-msdownload', bytes: 100 })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rifiuta un file sopra il tetto del suo tipo', async () => {
    const { db } = storageDb();
    await expect(
      registerCanvasUpload(db, { ...scope, path, fileName: 'foto.png', mimeType: 'image/png', bytes: 999_999_999 })
    ).rejects.toBeInstanceOf(UploadError);
  });

  it('un\'immagine valida crea l\'asset e un nodo `image` senza prompt', async () => {
    const { db, inserted } = storageDb();
    const { asset, node } = await registerCanvasUpload(db, {
      ...scope, path, fileName: 'foto.png', mimeType: 'image/png', bytes: 100
    });

    expect(asset.id).toBe('asset-1');
    expect(node.type).toBe('image');
    expect(inserted[0]).toMatchObject({ type: 'image', source: 'upload', url: path });
  });

  it('un documento scarica il file, lo converte e nasce come nodo `doc` con quel testo', async () => {
    const { db } = storageDb({
      download: async () => ({ data: new Blob(['contenuto del pdf']), error: null })
    });

    const { node } = await registerCanvasUpload(db, {
      ...scope, path: 'org/project/note.txt', fileName: 'note.txt', mimeType: 'text/plain', bytes: 20
    });

    expect(node.type).toBe('doc');
  });

  it('un documento che non si trova nello storage si rifiuta prima di creare niente', async () => {
    const { db, inserted } = storageDb({ download: async () => ({ data: null, error: new Error('not found') }) });

    await expect(
      registerCanvasUpload(db, { ...scope, path: 'org/project/note.txt', fileName: 'note.txt', mimeType: 'text/plain', bytes: 20 })
    ).rejects.toBeInstanceOf(UploadError);
    expect(inserted).toEqual([]);
  });
});
