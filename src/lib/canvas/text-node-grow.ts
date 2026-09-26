import { genNodeSize } from './gen-node';

export const TEXT_NODE_MIN_HEIGHT = genNodeSize('text').h;
export const TEXT_NODE_MAX_HEIGHT = 640;

export function grownTextNodeHeight(measuredContentHeight: number, userHeight?: number | null): number {
  if (userHeight != null) {
    return userHeight;
  }
  const clamped = Math.max(TEXT_NODE_MIN_HEIGHT, measuredContentHeight);
  return Math.min(TEXT_NODE_MAX_HEIGHT, clamped);
}
