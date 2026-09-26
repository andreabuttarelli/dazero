import { describe, expect, it, beforeEach } from 'vitest';
import { loadTextViewMode, storeTextViewMode } from './text-view-mode';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    }
  } as Storage;
}

describe('raw/markdown si ricorda per nodo, per chi guarda', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it('senza una scelta salvata, il default è markdown', () => {
    expect(loadTextViewMode(storage, 'node-1')).toBe('markdown');
  });

  it('salvare raw e rileggerlo torna raw, per quel nodo', () => {
    storeTextViewMode(storage, 'node-1', 'raw');
    expect(loadTextViewMode(storage, 'node-1')).toBe('raw');
  });

  it('due nodi non si contendono la stessa scelta', () => {
    storeTextViewMode(storage, 'node-1', 'raw');
    expect(loadTextViewMode(storage, 'node-2')).toBe('markdown');
  });

  it('senza storage (server, nessun browser) si torna al default e non si lancia', () => {
    expect(loadTextViewMode(undefined, 'node-1')).toBe('markdown');
    expect(() => storeTextViewMode(undefined, 'node-1', 'raw')).not.toThrow();
  });

  it('uno storage che lancia non rompe la lettura: si torna al default', () => {
    const throwing: Storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0
    };
    expect(loadTextViewMode(throwing, 'node-1')).toBe('markdown');
    expect(() => storeTextViewMode(throwing, 'node-1', 'raw')).not.toThrow();
  });
});
