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

describe('providerOf: un alias "~latest" di OpenRouter è lo stesso provider del suo id concreto', () => {
  it('la tilde iniziale non crea un secondo gruppo per lo stesso provider', () => {
    expect(providerOf('~deepseek/deepseek-v4-flash-latest')).toEqual({
      provider: 'deepseek',
      providerLabel: 'DeepSeek'
    });
    expect(providerOf('deepseek/deepseek-v4-flash')).toEqual({
      provider: 'deepseek',
      providerLabel: 'DeepSeek'
    });
  });

  it('il confronto è case-insensitive: "DeepSeek" e "Deepseek" restano un gruppo solo', () => {
    expect(providerOf('DeepSeek/deepseek-v4-flash').provider).toBe(
      providerOf('deepseek/deepseek-v4-flash').provider
    );
  });
});
