import { describe, it, expect } from 'vitest';
import { providerOf } from './model-provider';

describe('providerOf: chi ha fatto questo modello, dal suo id sul filo', () => {
  it('un id con prefisso lo riconosce e gli dà un nome leggibile', () => {
    expect(providerOf('anthropic/claude-haiku-4.5')).toEqual({
      provider: 'anthropic',
      providerLabel: 'Anthropic'
    });
  });

  it('un provider noto usa il nome commerciale, non il prefisso a nudo', () => {
    expect(providerOf('x-ai/grok-imagine-video-1.5')).toEqual({
      provider: 'x-ai',
      providerLabel: 'xAI'
    });
    expect(providerOf('bytedance-seed/seedream-5-0-pro')).toEqual({
      provider: 'bytedance-seed',
      providerLabel: 'ByteDance'
    });
  });

  it('un prefisso sconosciuto diventa un titolo dal proprio testo', () => {
    expect(providerOf('some-new-vendor/model-x')).toEqual({
      provider: 'some-new-vendor',
      providerLabel: 'Some New Vendor'
    });
  });

  it('un id senza slash finisce nel gruppo "other"', () => {
    expect(providerOf('nano-banana-2')).toEqual({ provider: 'other', providerLabel: 'Other' });
  });
});
