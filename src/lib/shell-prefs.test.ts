import { beforeEach, describe, expect, it } from 'vitest';
import { readChatTab, writeChatTab } from './shell-prefs';

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    clear: () => store.clear()
  };
}

describe('quale scheda del pannello chat era aperta (Chat o Guide)', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeLocalStorage();
  });

  it('senza nulla salvato, la scheda è chat', () => {
    expect(readChatTab()).toBe('chat');
  });

  it('scrivere guide e rileggere torna guide', () => {
    writeChatTab('guide');
    expect(readChatTab()).toBe('guide');
  });

  it('un valore fuori vocabolario ripiega su chat', () => {
    (globalThis as { localStorage: ReturnType<typeof fakeLocalStorage> }).localStorage.setItem(
      'dazero.chatTab',
      'qualcosa-altro'
    );
    expect(readChatTab()).toBe('chat');
  });
});
