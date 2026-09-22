import type { Db } from '$lib/server/db/client';

export const CANVAS_ASSET_BUCKET = 'canvas-assets';
const SIGNED_URL_SECONDS = 300;

export async function storeAssetFile(db: Db, path: string, file: File): Promise<void> {
  const { error } = await db.storage.from(CANVAS_ASSET_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) {
    throw error;
  }
}

export async function removeAssetFile(db: Db, path: string): Promise<void> {
  const { error } = await db.storage.from(CANVAS_ASSET_BUCKET).remove([path]);
  if (error) {
    throw error;
  }
}

export async function signAssetFile(db: Db, path: string): Promise<string> {
  const { data, error } = await db.storage.from(CANVAS_ASSET_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) {
    throw error;
  }
  return data.signedUrl;
}

export async function signAssetFiles(db: Db, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) {
    return out;
  }

  const { data } = await db.storage
    .from(CANVAS_ASSET_BUCKET)
    .createSignedUrls(clean, SIGNED_URL_SECONDS);
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) {
      out.set(row.path, row.signedUrl);
    }
  }
  return out;
}
