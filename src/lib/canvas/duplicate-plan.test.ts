import { describe, expect, it } from 'vitest';
import { planDuplicate, DUPLICATE_OFFSET } from './duplicate-plan';

const node = (id: string, type: string, data: Record<string, unknown>, x = 0, y = 0) => ({ id, type, data, x, y });
const edge = (id: string, source: string, target: string, sourceHandle: string | null = null, targetHandle: string | null = null) => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle
});

describe('cosa nasce da un duplica', () => {
  it('copia le tile scelte, spostate del passo dato', () => {
    const plan = planDuplicate({
      ids: ['a'],
      nodes: [node('a', 'text', { prompt: 'ciao' }, 100, 200)],
      edges: [],
      offset: DUPLICATE_OFFSET
    });

    expect(plan.nodes).toEqual([
      { sourceIndex: 0, type: 'text', data: { prompt: 'ciao' }, x: 132, y: 232 }
    ]);
  });

  it('porta con sé le linee interamente dentro la selezione', () => {
    const plan = planDuplicate({
      ids: ['a', 'b'],
      nodes: [node('a', 'text', {}), node('b', 'image', {})],
      edges: [edge('e1', 'a', 'b', 'text', 'text')],
      offset: DUPLICATE_OFFSET
    });

    expect(plan.edges).toEqual([{ sourceIndex: 0, targetIndex: 1, sourceHandle: 'text', targetHandle: 'text' }]);
  });

  it('lascia stare una linea con un solo capo dentro la selezione', () => {
    const plan = planDuplicate({
      ids: ['a'],
      nodes: [node('a', 'text', {}), node('b', 'image', {})],
      edges: [edge('e1', 'a', 'b')],
      offset: DUPLICATE_OFFSET
    });

    expect(plan.edges).toEqual([]);
  });

  it('toglie lo stato di corsa, non la configurazione', () => {
    const plan = planDuplicate({
      ids: ['a'],
      nodes: [node('a', 'image', { prompt: 'gatto', model: 'x', running: true, error: 'boom', refId: 'asset-1' })],
      edges: [],
      offset: DUPLICATE_OFFSET
    });

    expect(plan.nodes[0].data).toEqual({ prompt: 'gatto', model: 'x' });
  });

  it('non duplica quel che non è selezionato', () => {
    const plan = planDuplicate({
      ids: ['a'],
      nodes: [node('a', 'text', {}), node('b', 'text', {})],
      edges: [],
      offset: DUPLICATE_OFFSET
    });

    expect(plan.nodes).toHaveLength(1);
  });

  it('una selezione vuota non produce niente', () => {
    const plan = planDuplicate({ ids: [], nodes: [], edges: [], offset: DUPLICATE_OFFSET });

    expect(plan.nodes).toEqual([]);
    expect(plan.edges).toEqual([]);
  });
});
