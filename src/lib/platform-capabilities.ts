import { SOCIAL_PLATFORMS } from './canvas/social-platforms';

export type Platform = (typeof SOCIAL_PLATFORMS)[number];

export type MediaKind = 'image' | 'video';
export type MediaItem = { kind: MediaKind };

export type PublishAs = 'text' | 'image' | 'video' | 'carousel' | 'multi_image';

export type FormatResult = { ok: true; publishAs: PublishAs } | { ok: false; reason: string };

type PlatformCapability = {
  textOnly: boolean;
  singleImage: boolean;
  singleVideo: boolean;
  carousel: { max: number } | null;
  multiImage: { max: number } | null;
};

/**
 * UNA TABELLA SOLA, una riga per piattaforma. `formatFor` la legge e basta: nessun `if
 * (platform === ...)` sparso in composer, publish o MCP (CLAUDE.md). Aggiungere una piattaforma è
 * una riga qui, mai un ramo nuovo nel codice che pubblica.
 *
 * I valori vengono dal comportamento reale che Zernio pubblica oggi (`src/lib/server/publishing/
 * zernio.ts`, che manda `mediaItems: [{type, url}]` per piattaforma) e dalla decisione di prodotto
 * del 2026-09-22: nessun mix immagine+video in un post — nessuna delle nove piattaforme lo rende
 * come un'unica pubblicazione coerente, quindi si rifiuta sempre piuttosto che troncare in
 * silenzio quello che l'utente ha scelto.
 */
const CAPABILITIES: Record<Platform, PlatformCapability> = {
  instagram: { textOnly: false, singleImage: true, singleVideo: true, carousel: { max: 10 }, multiImage: null },
  facebook: { textOnly: true, singleImage: true, singleVideo: true, carousel: { max: 10 }, multiImage: null },
  linkedin: { textOnly: true, singleImage: true, singleVideo: true, carousel: { max: 9 }, multiImage: null },
  x: { textOnly: true, singleImage: true, singleVideo: true, carousel: null, multiImage: { max: 4 } },
  threads: { textOnly: true, singleImage: true, singleVideo: true, carousel: null, multiImage: null },
  tiktok: { textOnly: false, singleImage: true, singleVideo: true, carousel: null, multiImage: null },
  youtube: { textOnly: false, singleImage: false, singleVideo: true, carousel: null, multiImage: null },
  reddit: { textOnly: true, singleImage: true, singleVideo: true, carousel: null, multiImage: null },
  pinterest: { textOnly: false, singleImage: true, singleVideo: true, carousel: null, multiImage: null }
};

export const PLATFORM_CAPABILITIES: Readonly<Record<Platform, PlatformCapability>> = CAPABILITIES;

/** Limiti caption, per piattaforma — dal comportamento reale che Zernio pubblica oggi. */
export const CAPTION_LIMIT: Record<Platform, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  x: 280,
  threads: 500,
  tiktok: 2200,
  youtube: 5000,
  reddit: 40000,
  pinterest: 500
};

function isPlatform(platform: string): platform is Platform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(platform);
}

function refuse(reason: string): FormatResult {
  return { ok: false, reason };
}

/**
 * Deriva il FORMATO da cosa l'utente ha scelto, mai il contrario: un'immagine → post immagine, N
 * immagini → carosello (dove la piattaforma lo rende) o multi-immagine (X, fino a 4), un video →
 * reel/video, misto → rifiutato ovunque. Quando i media non stanno sulla piattaforma lo dice, non
 * tronca e non scarta in silenzio.
 */
export function formatFor(platform: Platform, media: readonly MediaItem[]): FormatResult {
  if (!isPlatform(platform)) return refuse(`${platform} is not a supported platform`);

  const capability = CAPABILITIES[platform];
  const images = media.filter((m) => m.kind === 'image').length;
  const videos = media.filter((m) => m.kind === 'video').length;

  if (images > 0 && videos > 0) {
    return refuse(`${platform} does not publish a mix of images and video in one post`);
  }

  if (images === 0 && videos === 0) {
    if (capability.textOnly) return { ok: true, publishAs: 'text' };
    return refuse(`${platform} needs at least one image or video: it does not publish text-only posts`);
  }

  if (videos > 0) {
    if (videos > 1) return refuse(`${platform} publishes at most one video per post`);
    if (!capability.singleVideo) return refuse(`${platform} does not publish video`);
    return { ok: true, publishAs: 'video' };
  }

  if (images === 1) {
    if (!capability.singleImage) return refuse(`${platform} does not publish a single image`);
    return { ok: true, publishAs: 'image' };
  }

  if (capability.carousel && images <= capability.carousel.max) {
    return { ok: true, publishAs: 'carousel' };
  }
  if (capability.multiImage && images <= capability.multiImage.max) {
    return { ok: true, publishAs: 'multi_image' };
  }
  if (capability.carousel) {
    return refuse(`${platform} publishes at most ${capability.carousel.max} images in a carousel`);
  }
  if (capability.multiImage) {
    return refuse(`${platform} publishes at most ${capability.multiImage.max} images in one post`);
  }
  return refuse(`${platform} does not publish more than one image per post`);
}
