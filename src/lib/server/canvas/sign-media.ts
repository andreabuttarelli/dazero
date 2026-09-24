import type { Db } from '$lib/server/db/client';
import { signKnowledgePaths } from '$lib/server/media-archive';
import { signAssetFiles } from '$lib/server/repos/asset-storage';

const ABSOLUTE_URL = /^https?:\/\//;

export async function signMediaPaths(db: Db, paths: string[]): Promise<string[]> {
  const stored = paths.filter((p) => !ABSOLUTE_URL.test(p));
  const [rendered, uploaded] = await Promise.all([
    signKnowledgePaths(db as never, stored),
    signAssetFiles(db, stored)
  ]);

  return paths
    .map((p) => (ABSOLUTE_URL.test(p) ? p : rendered.get(p) ?? uploaded.get(p) ?? null))
    .filter((url): url is string => url !== null);
}
