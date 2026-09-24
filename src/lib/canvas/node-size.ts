import { isNodeType, type NodeType } from './node-data';
import { genNodeSize } from './gen-node';
import { iframeNodeSize } from './iframe-node';
import { docNodeSize } from './doc-node';
import { productsNodeSize } from './products-node';
import { socialFeedNodeSize } from './social-feed-node';
import { influencerNodeSize } from './influencer-node';

type Size = { w: number; h: number };

const FALLBACK_SIZE: Size = { w: 320, h: 240 };

const NODE_SIZE: Record<NodeType, () => Size> = {
  text: () => genNodeSize('text'),
  image: () => genNodeSize('image'),
  video: () => genNodeSize('video'),
  doc: docNodeSize,
  iframe: iframeNodeSize,
  social_account_feed: socialFeedNodeSize,
  social_post_mockup: () => FALLBACK_SIZE,
  products: productsNodeSize,
  ads: () => FALLBACK_SIZE,
  influencer: influencerNodeSize,
  list: () => FALLBACK_SIZE,
  select: () => FALLBACK_SIZE
};

export function nodeSize(type: string): Size {
  return isNodeType(type) ? NODE_SIZE[type]() : FALLBACK_SIZE;
}
