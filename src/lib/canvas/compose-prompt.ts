import type { GenMedium } from './gen-node';

type Composer = (material: string[], own: string) => string;

const joinPlain: Composer = (material, own) =>
  [...material, own].filter((t) => t.trim()).join('\n\n');

const frameAsMaterial: Composer = (material, own) => {
  const sources = material.filter((t) => t.trim());
  if (!sources.length) {
    return own;
  }

  const framed = sources.map((text, i) => `<material index="${i + 1}">\n${text}\n</material>`).join('\n\n');
  const request = own.trim() ? own : 'Work with the material above.';
  return `The user connected this material:\n\n${framed}\n\n${request}`;
};

const COMPOSER: Record<GenMedium, Composer> = {
  text: frameAsMaterial,
  image: joinPlain,
  video: joinPlain
};

export function composePrompt(medium: GenMedium, material: string[], own: string): string {
  return COMPOSER[medium](material, own);
}
