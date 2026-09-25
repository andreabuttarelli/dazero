import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const systemOneMock = vi.fn();

vi.mock('@typesafe-ai/sdk', () => ({
  TypeSafeClient: vi.fn().mockImplementation(() => ({
    systemOne: systemOneMock
  }))
}));

import { decideWithJev } from './jev';
import type { BooleanQuestion, ChooseOneQuestion, ScoreQuestion } from '$lib/canvas/decide';

const ORIGINAL_ENV = process.env.TYPESAFE_API_KEY;

beforeEach(() => {
  systemOneMock.mockReset();
  process.env.TYPESAFE_API_KEY = 'test-key';
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = ORIGINAL_ENV;
});

describe('decideWithJev', () => {
  it('returns null when TYPESAFE_API_KEY is missing', async () => {
    delete process.env.TYPESAFE_API_KEY;
    const question: BooleanQuestion = { kind: 'boolean', instructions: 'Is this a video?' };

    const result = await decideWithJev(question, 'some state');

    expect(result).toBeNull();
    expect(systemOneMock).not.toHaveBeenCalled();
  });

  it('sends a noul question with the exact wire shape and maps the response', async () => {
    systemOneMock.mockResolvedValue({
      model: 'jev-latest',
      answers: { q: { type: 'noul', noul: 0.87 } },
      usage: { input_tokens: 42, output_tokens: 0 }
    });

    const question: BooleanQuestion = { kind: 'boolean', instructions: 'Is this a video?' };
    const result = await decideWithJev(question, { nodeType: 'image' });

    expect(systemOneMock).toHaveBeenCalledWith(
      {
        state: { nodeType: 'image' },
        model: 'jev-latest',
        questions: { q: { type: 'noul', instructions: 'Is this a video?' } }
      },
      expect.objectContaining({ timeout: 5000 })
    );
    expect(result).toEqual({ kind: 'boolean', value: true, confidence: 0.87 });
  });

  it('rounds a noul answer below 0.5 to false', async () => {
    systemOneMock.mockResolvedValue({
      model: 'jev-latest',
      answers: { q: { type: 'noul', noul: 0.2 } },
      usage: { input_tokens: 10, output_tokens: 0 }
    });

    const question: BooleanQuestion = { kind: 'boolean', instructions: 'Is this a video?' };
    const result = await decideWithJev(question, 'state');

    expect(result).toEqual({ kind: 'boolean', value: false, confidence: 0.2 });
  });

  it('sends a choice question and maps the response', async () => {
    systemOneMock.mockResolvedValue({
      model: 'jev-latest',
      answers: {
        q: { type: 'choice', choice: 'animate', probabilities: { animate: 0.9, caption: 0.1 }, confidence: 0.9 }
      },
      usage: { input_tokens: 20, output_tokens: 0 }
    });

    const question: ChooseOneQuestion = { kind: 'choose-one', instructions: 'What next?', options: ['animate', 'caption'] };
    const result = await decideWithJev(question, 'state');

    expect(systemOneMock).toHaveBeenCalledWith(
      {
        state: 'state',
        model: 'jev-latest',
        questions: { q: { type: 'choice', instructions: 'What next?', criteria: { animate: null, caption: null } } }
      },
      expect.objectContaining({ timeout: 5000 })
    );
    expect(result).toEqual({ kind: 'choose-one', value: 'animate', confidence: 0.9 });
  });

  it('sends a score question and maps the response', async () => {
    systemOneMock.mockResolvedValue({
      model: 'jev-latest',
      answers: { q: { type: 'score', score: 2, legend: {}, probabilities: {}, confidence: 0.75 } },
      usage: { input_tokens: 15, output_tokens: 0 }
    });

    const question: ScoreQuestion = { kind: 'score', instructions: 'How relevant?', levels: ['low', 'medium', 'high'] };
    const result = await decideWithJev(question, 'state');

    expect(systemOneMock).toHaveBeenCalledWith(
      {
        state: 'state',
        model: 'jev-latest',
        questions: { q: { type: 'score', instructions: 'How relevant?', criteria: ['low', 'medium', 'high'] } }
      },
      expect.objectContaining({ timeout: 5000 })
    );
    expect(result).toEqual({ kind: 'score', value: 2, confidence: 0.75 });
  });

  it('returns null on a non-2xx failure', async () => {
    systemOneMock.mockRejectedValue(new Error('HTTP 422'));
    const question: BooleanQuestion = { kind: 'boolean', instructions: 'Is this a video?' };

    const result = await decideWithJev(question, 'state');

    expect(result).toBeNull();
  });

  it('passes the fixed timeout to the SDK call', async () => {
    systemOneMock.mockResolvedValue({
      model: 'jev-latest',
      answers: { q: { type: 'noul', noul: 1 } },
      usage: { input_tokens: 1, output_tokens: 0 }
    });
    const question: BooleanQuestion = { kind: 'boolean', instructions: 'x' };

    await decideWithJev(question, 'state');

    const options = systemOneMock.mock.calls[0][1] as { timeout?: number };
    expect(options.timeout).toBe(5000);
  });

  it('returns null on network error', async () => {
    systemOneMock.mockRejectedValue(new TypeError('fetch failed'));
    const question: BooleanQuestion = { kind: 'boolean', instructions: 'Is this a video?' };

    const result = await decideWithJev(question, 'state');

    expect(result).toBeNull();
  });
});
