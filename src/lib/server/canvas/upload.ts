import { randomUUID } from 'node:crypto';
import type { Db } from '$lib/server/db/client';
import { createNode } from '$lib/server/repos/canvas';
import { deleteAsset, insertAsset, type AssetType } from '$lib/server/repos/assets';
import { removeAssetFile, storeAssetFile } from '$lib/server/repos/asset-storage';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const FILE_TYPES: Record<string, AssetType> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/avif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
  'text/plain': 'document'
};

export class UploadError extends Error {
  constructor(public readonly status: 400 | 413, message: string) {
    super(message);
  }
}

export async function uploadCanvasAsset(db: Db, input: {
  orgId: string;
  projectId: string;
  canvasId: string;
  userId: string;
  file: File;
  x: number;
  y: number;
}) {
  const { file } = input;
  const type = FILE_TYPES[file.type];
  if (!type || !file.size) {
    throw new UploadError(400, 'Choose an image, video, PDF or text file.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(413, 'Files must be 20 MB or smaller.');
  }

  const path = `${input.orgId}/${input.projectId}/${randomUUID()}`;
  await storeAssetFile(db, path, file);
  let assetId: string | undefined;

  try {
    const asset = await insertAsset(db, {
      orgId: input.orgId, projectId: input.projectId, type, source: 'upload',
      url: path, mimeType: file.type, bytes: file.size
    });
    assetId = asset.id;
    const node = await createNode(db, {
      orgId: input.orgId, projectId: input.projectId, canvasId: input.canvasId,
      type, x: input.x, y: input.y,
      data: {
        assetId: asset.id, url: `/p/${input.projectId}/c/${input.canvasId}/assets/${asset.id}`,
        name: file.name, mimeType: file.type
      }
    });
    return { asset, node };
  } catch (error) {
    const cleanup = await Promise.allSettled([
      removeAssetFile(db, path),
      ...(assetId ? [deleteAsset(db, { orgId: input.orgId, assetId })] : [])
    ]);
    const failures = cleanup.filter((result) => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError([error, ...failures.map((result) => result.reason)], 'Upload failed; cleanup incomplete.');
    }
    throw error;
  }
}
