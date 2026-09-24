import { describe, expect, it } from 'vitest';
import { enabledFor } from './selection-actions';

describe('enabledFor', () => {
  it('create-post è abilitata con un\'immagine nella selezione', () => {
    const result = enabledFor('create-post', [{ id: '1', type: 'image', data: { refId: 'a1' } }]);
    expect(result.enabled).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('create-post è disabilitata senza media né testo, e dà una ragione', () => {
    const result = enabledFor('create-post', [{ id: '1', type: 'iframe', data: { url: 'x' } }]);
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('Serve almeno un media o un testo nella selezione');
  });

  it('duplicate è sempre abilitata, indipendentemente dal contenuto', () => {
    expect(enabledFor('duplicate', []).enabled).toBe(true);
    expect(enabledFor('duplicate', [{ id: '1', type: 'text', data: {} }]).enabled).toBe(true);
  });

  it('run-workflow è abilitata su due nodi testo collegati', () => {
    const nodes = [
      { id: '1', type: 'text', data: {} },
      { id: '2', type: 'text', data: {} }
    ];
    const edges = [{ sourceNodeId: '1', targetNodeId: '2' }];
    const result = enabledFor('run-workflow', nodes, edges);
    expect(result.enabled).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('run-workflow è disabilitata su due nodi non collegati, e dà la ragione di planWorkflow', () => {
    const nodes = [
      { id: '1', type: 'text', data: {} },
      { id: '2', type: 'text', data: {} }
    ];
    const result = enabledFor('run-workflow', nodes, []);
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('i nodi selezionati non sono tutti collegati fra loro');
  });
});
