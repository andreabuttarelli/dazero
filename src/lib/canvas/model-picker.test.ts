import { describe, it, expect } from 'vitest';
import { filterChoices, groupByProvider } from './model-picker';
import type { ModelChoice } from './gen-node';

const choice = (over: Partial<ModelChoice> = {}): ModelChoice => ({
  id: 'm1',
  label: 'Modello',
  aspectRatios: [],
  provider: 'anthropic',
  providerLabel: 'Anthropic',
  ...over
});

describe('filterChoices: cerca per nome del modello o del provider, senza badare al maiuscolo', () => {
  it('una query vuota non filtra niente', () => {
    const choices = [choice({ id: 'a' }), choice({ id: 'b' })];
    expect(filterChoices(choices, '')).toEqual(choices);
  });

  it('trova per sottostringa del nome del modello, ignorando il maiuscolo', () => {
    const claude = choice({ id: 'a', label: 'Claude Haiku' });
    const gpt = choice({ id: 'b', label: 'GPT Image 2' });
    expect(filterChoices([claude, gpt], 'haiku')).toEqual([claude]);
  });

  it('trova anche per il nome del provider', () => {
    const claude = choice({ id: 'a', label: 'Claude Haiku', provider: 'anthropic', providerLabel: 'Anthropic' });
    const gpt = choice({ id: 'b', label: 'GPT Image 2', provider: 'openai', providerLabel: 'OpenAI' });
    expect(filterChoices([claude, gpt], 'OPENAI')).toEqual([gpt]);
  });
});

describe('groupByProvider: un gruppo per provider, nell\'ordine in cui compaiono nel catalogo', () => {
  it('raggruppa le scelte sotto il loro provider', () => {
    const a = choice({ id: 'a', provider: 'anthropic', providerLabel: 'Anthropic' });
    const b = choice({ id: 'b', provider: 'openai', providerLabel: 'OpenAI' });
    const c = choice({ id: 'c', provider: 'anthropic', providerLabel: 'Anthropic' });

    expect(groupByProvider([a, b, c])).toEqual([
      { provider: 'anthropic', providerLabel: 'Anthropic', choices: [a, c] },
      { provider: 'openai', providerLabel: 'OpenAI', choices: [b] }
    ]);
  });

  it('un catalogo vuoto non produce gruppi', () => {
    expect(groupByProvider([])).toEqual([]);
  });
});
