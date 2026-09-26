import sharp from 'sharp';
import type { Db } from '$lib/server/db/client';
import { findNode, writeNodeData } from '$lib/server/repos/canvas';
import { findAsset, insertAsset, type Asset } from '$lib/server/repos/assets';
import { CANVAS_ASSET_BUCKET } from '$lib/server/repos/asset-storage';
import type { Actor } from '$lib/server/repos/actor';
import { applyStack } from '$lib/canvas/effects';
import type { EffectStep, Pixels } from '$lib/canvas/effects';
import { renderVideoEffects } from './video-effects';

export type ApplyEffectsOutcome =
  | { outcome: 'applied'; asset: Asset; bytes: Buffer; pngBytes?: Buffer }
  | { outcome: 'refused'; error: string }
  | { outcome: 'conflict' };

/**
 * IL RENDER SERVER-SIDE DI UN NODO `effects` — la stessa `applyStack` che `EffectsEditor.svelte`
 * gira nel browser, chiamata qui perché un agente non ha un browser: legge l'immagine a monte
 * (`data.sourceRefId`), decodifica, applica la pila, ricodifica in PNG, la deposita come asset e
 * scrive `{ refId, sourceRefId }` sul nodo con la stessa concorrenza ottimistica di ogni altra
 * scrittura (`writeNodeData`). Nessun credito speso: non c'è un provider da pagare.
 */
export async function applyEffectsNode(
  db: Db,
  input: { orgId: string; nodeId: string; actor?: Actor }
): Promise<ApplyEffectsOutcome> {
  const node = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });
  if (!node) {
    return { outcome: 'refused', error: 'node_not_found' };
  }
  if (node.type !== 'effects') {
    return { outcome: 'refused', error: `not_an_effects_node: ${node.type}` };
  }

  const sourceRefId = typeof node.data.sourceRefId === 'string' ? node.data.sourceRefId : null;
  if (!sourceRefId) {
    return { outcome: 'refused', error: 'sourceRefId mancante: nessuna immagine a monte da elaborare' };
  }

  const sourceAsset = await findAsset(db, { orgId: input.orgId, assetId: sourceRefId });
  if (!sourceAsset?.url) {
    return { outcome: 'refused', error: 'sourceRefId punta a un asset senza file' };
  }

  const inputBytes = await downloadAssetBytes(db, sourceAsset.url);
  if (!inputBytes) {
    return { outcome: 'refused', error: 'impossibile scaricare l\'immagine sorgente' };
  }

  const steps = Array.isArray(node.data.effects) ? (node.data.effects as EffectStep[]) : [];
  const isVideo = sourceAsset.type === 'video' || node.data.mediaKind === 'video';
  const rendered = isVideo
    ? await renderVideoEffects(inputBytes, steps)
    : await renderImageEffects(inputBytes, steps);

  const extension = isVideo ? 'mp4' : 'png';
  const path = `${input.orgId}/${node.projectId}/effects/${node.id}-${Date.now()}.${extension}`;
  const { error: uploadError } = await db.storage
    .from(CANVAS_ASSET_BUCKET)
    .upload(path, rendered.bytes, { contentType: rendered.mimeType, upsert: false });
  if (uploadError) {
    return { outcome: 'refused', error: `store_failed: ${uploadError.message}` };
  }

  const asset = await insertAsset(db, {
    orgId: input.orgId,
    projectId: node.projectId,
    type: isVideo ? 'video' : 'image',
    source: 'generated',
    url: path,
    mimeType: rendered.mimeType,
    width: rendered.width,
    height: rendered.height,
    durationS: isVideo ? sourceAsset.durationS : undefined,
    bytes: rendered.bytes.length,
    sourceNodeId: node.id
  });

  const write = await writeNodeData(db, {
    orgId: input.orgId,
    nodeId: node.id,
    data: { ...node.data, refId: asset.id, sourceRefId, mediaKind: isVideo ? 'video' : 'image' },
    expectedVersion: node.version,
    actor: input.actor
  });

  if (write.outcome === 'conflict') {
    return { outcome: 'conflict' };
  }

  return { outcome: 'applied', asset, bytes: rendered.bytes, ...(isVideo ? {} : { pngBytes: rendered.bytes }) };
}

async function renderImageEffects(inputBytes: Buffer, steps: EffectStep[]) {
  const pixels = await decodeToPixels(inputBytes);
  const result = applyStack(pixels, steps);
  return {
    bytes: await encodePng(result),
    mimeType: 'image/png' as const,
    width: result.width,
    height: result.height
  };
}

async function downloadAssetBytes(db: Db, url: string): Promise<Buffer | null> {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }

  const { data, error } = await db.storage.from(CANVAS_ASSET_BUCKET).download(url);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function decodeToPixels(bytes: Buffer): Promise<Pixels> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

async function encodePng(pixels: Pixels): Promise<Buffer> {
  return sharp(Buffer.from(pixels.data), {
    raw: { width: pixels.width, height: pixels.height, channels: 4 }
  })
    .png()
    .toBuffer();
}
