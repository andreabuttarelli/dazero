import type { LayoutId } from './composition/types';
import type { CameraPresetId } from './composition/camera';

export type CompositionAspect = '9:16' | '1:1' | '16:9';

export type CompositionNode = {
  id: string;
  layout: LayoutId;
  layoutParams: Record<string, number | string>;
  camera: { preset: CameraPresetId; params: Record<string, number | string> };
  background: { color: string };
  duration: number;
  aspect: CompositionAspect;
  refId: string | null;
};

const COMPOSITION_NODE_SIZE = { w: 320, h: 240 };

export function compositionNodeSize(): { w: number; h: number } {
  return { ...COMPOSITION_NODE_SIZE };
}

export type NewCompositionTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layout: LayoutId;
  layoutParams: Record<string, number | string>;
  camera: { preset: CameraPresetId; params: Record<string, number | string> };
  background: { color: string };
  duration: number;
  aspect: CompositionAspect;
  connectable: true;
};

const DEFAULT_LAYOUT: LayoutId = 'tilted-grid';
const DEFAULT_CAMERA: CameraPresetId = 'slow-orbit';
const DEFAULT_BACKGROUND = '#000000';
const DEFAULT_DURATION_SECONDS = 6;
const DEFAULT_ASPECT: CompositionAspect = '9:16';

export function newCompositionNodeAt(at: { x: number; y: number }): NewCompositionTile {
  const { w, h } = compositionNodeSize();

  return {
    id: crypto.randomUUID(),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    layout: DEFAULT_LAYOUT,
    layoutParams: {},
    camera: { preset: DEFAULT_CAMERA, params: {} },
    background: { color: DEFAULT_BACKGROUND },
    duration: DEFAULT_DURATION_SECONDS,
    aspect: DEFAULT_ASPECT,
    connectable: true
  };
}

const IMAGE_REF_FIELDS = ['refId', 'assetId'] as const;

export function upstreamImageRefs(
  targetId: string,
  edges: { source: string; target: string }[],
  nodes: { id: string; data: Record<string, unknown> }[]
): string[] {
  const refs: string[] = [];

  for (const edge of edges) {
    if (edge.target !== targetId) {
      continue;
    }

    const source = nodes.find((node) => node.id === edge.source);
    if (!source) {
      continue;
    }

    const listItems = source.data.items;
    if (Array.isArray(listItems)) {
      for (const item of listItems) {
        const assetId = (item as Record<string, unknown>)?.asset_id;
        if (typeof assetId === 'string' && assetId) {
          refs.push(assetId);
        }
      }
      continue;
    }

    const ref = IMAGE_REF_FIELDS.map((field) => source.data[field]).find((v) => typeof v === 'string' && v);
    if (typeof ref === 'string') {
      refs.push(ref);
    }
  }

  return refs;
}
