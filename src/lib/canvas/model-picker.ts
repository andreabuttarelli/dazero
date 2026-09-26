import type { ModelChoice } from './gen-node';

export function filterChoices(choices: ModelChoice[], query: string): ModelChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return choices;
  return choices.filter(
    (c) => c.label.toLowerCase().includes(q) || c.providerLabel.toLowerCase().includes(q)
  );
}

export type ProviderGroup = { provider: string; providerLabel: string; choices: ModelChoice[] };

export function groupByProvider(choices: ModelChoice[]): ProviderGroup[] {
  const order: string[] = [];
  const groups = new Map<string, ProviderGroup>();

  for (const choice of choices) {
    if (!groups.has(choice.provider)) {
      order.push(choice.provider);
      groups.set(choice.provider, { provider: choice.provider, providerLabel: choice.providerLabel, choices: [] });
    }
    groups.get(choice.provider)!.choices.push(choice);
  }

  return order.map((key) => groups.get(key)!);
}
