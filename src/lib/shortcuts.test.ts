import { describe, it, expect } from 'vitest';
import { isTypingTarget } from './shortcuts';

const TEXTAREA = { tagName: 'TEXTAREA', isContentEditable: false };
const TEXT_INPUT = { tagName: 'INPUT', type: 'text', isContentEditable: false };
const EDITABLE = { tagName: 'DIV', isContentEditable: true };

describe('isTypingTarget', () => {
  it('riconosce i campi in cui si scrive', () => {
    expect(isTypingTarget(TEXTAREA as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget(TEXT_INPUT as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget(EDITABLE as unknown as EventTarget)).toBe(true);
    expect(
      isTypingTarget({ tagName: 'INPUT', type: 'search' } as unknown as EventTarget)
    ).toBe(true);
  });

  it('non scambia per campo di testo ciò che non lo è', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
