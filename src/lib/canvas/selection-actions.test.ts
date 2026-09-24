import { describe, expect, it } from 'vitest';
import { SELECTION_ACTIONS } from './selection-actions';

describe('cosa si può fare a una selezione', () => {
  it('ogni azione ha un id e un’etichetta', () => {
    for (const action of SELECTION_ACTIONS) {
      expect(action.id.length).toBeGreaterThan(0);
      expect(action.label.length).toBeGreaterThan(0);
    }
  });

  it('non ripete lo stesso id due volte', () => {
    const ids = SELECTION_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('porta duplica e cancella, le due che la tastiera già sa fare', () => {
    const ids = SELECTION_ACTIONS.map((a) => a.id);
    expect(ids).toContain('duplicate');
    expect(ids).toContain('delete');
  });

  it("porta copia id: l'id di un nodo è ciò che un agente via MCP chiede per lavorarci", () => {
    const ids = SELECTION_ACTIONS.map((a) => a.id);
    expect(ids).toContain('copy-id');
  });
});
