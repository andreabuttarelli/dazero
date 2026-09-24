export type PostCompositionNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  text?: string | null;
};

export type PostCompositionMedia = { nodeId: string; assetId: string };
export type PostCompositionCaption = { nodeId: string; text: string };

export type PostComposition = {
  media: PostCompositionMedia[];
  captions: PostCompositionCaption[];
  enabled: boolean;
};

const MEDIA_TYPES = new Set(['image', 'video']);

function mediaAssetId(node: PostCompositionNode): string | null {
  return MEDIA_TYPES.has(node.type) && typeof node.data.refId === 'string' ? node.data.refId : null;
}

const CAPTION_OF: Record<string, (node: PostCompositionNode) => unknown> = {
  doc: (node) => node.data.content,
  text: (node) => (node.text?.trim() ? node.text : node.data.prompt)
};

function captionText(node: PostCompositionNode): string | null {
  const value = CAPTION_OF[node.type]?.(node);
  return typeof value === 'string' && value.trim() ? value : null;
}

export function postCompositionFor(nodes: PostCompositionNode[]): PostComposition {
  const media: PostCompositionMedia[] = [];
  const captions: PostCompositionCaption[] = [];

  for (const node of nodes) {
    const caption = captionText(node);
    if (caption !== null) {
      captions.push({ nodeId: node.id, text: caption });
      continue;
    }

    const assetId = mediaAssetId(node);
    if (assetId) {
      media.push({ nodeId: node.id, assetId });
    }
  }

  return { media, captions, enabled: media.length > 0 || captions.length > 0 };
}
