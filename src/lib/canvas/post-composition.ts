export type PostCompositionNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

export type PostCompositionMedia = { nodeId: string; assetId: string };
export type PostCompositionCaption = { nodeId: string; text: string };

export type PostComposition = {
  media: PostCompositionMedia[];
  captions: PostCompositionCaption[];
  enabled: boolean;
};

function mediaAssetId(node: PostCompositionNode): string | null {
  if ((node.type === 'image' || node.type === 'video') && typeof node.data.assetId === 'string') {
    return node.data.assetId;
  }
  if (node.data.status === 'done' && typeof node.data.output_asset_id === 'string') {
    return node.data.output_asset_id;
  }
  return null;
}

function captionText(node: PostCompositionNode): string | null {
  if (node.type === 'doc' && typeof node.data.content === 'string') {
    return node.data.content;
  }
  if (node.type === 'text') {
    if (node.data.status === 'done' && typeof node.data.output_text === 'string') {
      return node.data.output_text;
    }
    if (typeof node.data.prompt === 'string') {
      return node.data.prompt;
    }
  }
  return null;
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

  return { media, captions, enabled: media.length > 0 };
}
