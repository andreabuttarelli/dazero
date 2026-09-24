export type TextViewMode = 'raw' | 'markdown';

const KEY_PREFIX = 'dazero:text-view-mode:';

export function loadTextViewMode(storage: Storage | undefined, nodeId: string): TextViewMode {
  try {
    return storage?.getItem(KEY_PREFIX + nodeId) === 'raw' ? 'raw' : 'markdown';
  } catch {
    return 'markdown';
  }
}

export function storeTextViewMode(storage: Storage | undefined, nodeId: string, mode: TextViewMode): void {
  try {
    storage?.setItem(KEY_PREFIX + nodeId, mode);
  } catch {
    // Uno storage bloccato o assente (privata, quota, policy, SSR) non deve rompere il toggle:
    // resta per-sessione invece che persistere, e chi guarda continua a poter cambiare vista.
  }
}
