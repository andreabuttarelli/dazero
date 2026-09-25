import { describe, expect, it, vi, beforeEach } from 'vitest';

const { llmText } = vi.hoisted(() => ({ llmText: vi.fn() }));

vi.mock('$lib/server/llm', () => ({ llmText }));

import { enhancePrompt } from './prompt-enhance';

beforeEach(() => {
  vi.clearAllMocks();
  llmText.mockResolvedValue({ text: '  a rewritten prompt  ', citations: [] });
});

describe('enhancePrompt', () => {
  it('mette il craft del modello scelto nel system prompt', async () => {
    await enhancePrompt({ medium: 'image', model: 'nano-banana-2', prompt: 'a cat' });

    const call = llmText.mock.calls[0]![0];
    expect(call.system).toContain('Nano Banana');
  });

  it('passa il prompt dell’utente come prompt della chiamata', async () => {
    await enhancePrompt({ medium: 'image', model: 'nano-banana-2', prompt: 'a cat on a roof' });

    const call = llmText.mock.calls[0]![0];
    expect(call.prompt).toContain('a cat on a roof');
  });

  it('un modello senza craft usa la guida generica del medium', async () => {
    await enhancePrompt({ medium: 'video', model: 'unknown-model-xyz', prompt: 'a dog runs' });

    const call = llmText.mock.calls[0]![0];
    expect(call.system.toLowerCase()).toContain('video');
  });

  it('prompt vuoto non chiama il modello e torna invariato', async () => {
    const out = await enhancePrompt({ medium: 'image', model: 'nano-banana-2', prompt: '   ' });

    expect(llmText).not.toHaveBeenCalled();
    expect(out.prompt).toBe('   ');
  });

  it('rifila il risultato', async () => {
    const out = await enhancePrompt({ medium: 'image', model: 'nano-banana-2', prompt: 'a cat' });

    expect(out.prompt).toBe('a rewritten prompt');
  });
});
