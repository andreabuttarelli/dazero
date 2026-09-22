/**
 * IL NODO `social_account_feed`: una query su un handle pubblico, non una copia del suo profilo.
 *
 * Stesso patto di `products-node.ts`: indipendente da qualsiasi brand — prende una piattaforma e
 * un handle e scarica da lì. I post scaricati vivono in `social_posts`, mai dentro `nodes.data`.
 */
import type { SyncStatus } from './sync-state';

/** Gli stessi valori di `social_accounts_platform_check` — la stessa piattaforma, la stessa riga. */
export const SOCIAL_FEED_PLATFORMS = [
  'instagram',
  'facebook',
  'x',
  'linkedin',
  'tiktok',
  'threads',
  'youtube',
  'reddit',
  'pinterest'
] as const;

export type SocialFeedPlatform = (typeof SOCIAL_FEED_PLATFORMS)[number];

export function isSocialFeedPlatform(x: string): x is SocialFeedPlatform {
  return (SOCIAL_FEED_PLATFORMS as readonly string[]).includes(x);
}

export type SocialFeedNode = {
  id: string;
  platform: SocialFeedPlatform;
  handle: string;
  limit: number;
  syncStatus: SyncStatus;
  syncError: string | null;
  syncedCount: number;
  syncedAt: string | null;
};

const SOCIAL_FEED_NODE_SIZE = { w: 420, h: 360 };
const DEFAULT_LIMIT = 20;

export function socialFeedNodeSize(): { w: number; h: number } {
  return { ...SOCIAL_FEED_NODE_SIZE };
}

export type NewSocialFeedTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  platform: SocialFeedPlatform;
  handle: string;
  limit: number;
  connectable: false;
};

export function newSocialFeedNodeAt(at: { x: number; y: number }): NewSocialFeedTile {
  const { w, h } = socialFeedNodeSize();

  return {
    id: crypto.randomUUID(),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    platform: 'instagram',
    handle: '',
    limit: DEFAULT_LIMIT,
    connectable: false
  };
}
