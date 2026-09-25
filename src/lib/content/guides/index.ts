export type GuideSlug =
  | 'nodi-e-connessioni'
  | 'generare'
  | 'loop'
  | 'selezione-e-scorciatoie'
  | 'creare-un-post'
  | 'effetti';

export type GuideEntry = {
  slug: GuideSlug;
  title: string;
  content: string;
};

const perGuide = import.meta.glob<{ default: GuideEntry }>('./*.guide.ts', { eager: true });

export const guideEntries: GuideEntry[] = Object.keys(perGuide)
  .sort((a, b) => a.localeCompare(b))
  .map((path) => perGuide[path].default);

export function guideBySlug(slug: string): GuideEntry | null {
  return guideEntries.find((g) => g.slug === slug) ?? null;
}
