export type ModelProvider = { provider: string; providerLabel: string };

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  'bytedance-seed': 'ByteDance',
  bytedance: 'ByteDance',
  qwen: 'Qwen',
  'x-ai': 'xAI',
  kwaivgi: 'Kling',
  'black-forest-labs': 'Black Forest Labs',
  meta: 'Meta',
  mistralai: 'Mistral',
  perplexity: 'Perplexity',
  deepseek: 'DeepSeek',
  cohere: 'Cohere'
};

function labelFor(key: string): string {
  return PROVIDER_LABELS[key] ?? key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function providerOf(wireId: string): ModelProvider {
  const slash = wireId.indexOf('/');
  const key = slash === -1 ? 'other' : wireId.slice(0, slash);
  return { provider: key, providerLabel: labelFor(key) };
}
