export type GenerativeMedium = 'text' | 'image' | 'video';

export const DEFAULT_MODEL: Record<GenerativeMedium, string> = {
  text: 'anthropic/claude-haiku-4.5',
  image: 'nano-banana-2',
  video: 'bytedance/seedance-2-fast'
};

export function effectiveModel(
  medium: GenerativeMedium,
  saved: string | null | undefined,
  choices: readonly { id: string }[]
): string | null {
  if (saved) {
    return saved;
  }
  if (choices.some((c) => c.id === DEFAULT_MODEL[medium])) {
    return DEFAULT_MODEL[medium];
  }
  return choices[0]?.id ?? null;
}
