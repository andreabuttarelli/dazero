import { describe, it, expect } from 'vitest';
import { CANVAS_EDGE_KINDS, isCanvasEdgeKind, toFlowEdges, type CanvasEdgeRow } from './canvas-edges';

const row = (over: Partial<CanvasEdgeRow> = {}): CanvasEdgeRow => ({
  id: 'e1',
  source_item_id: 'a',
  target_item_id: 'b',
  kind: 'derives_from',
  label: null,
  ...over
});

describe('gli archi della tela', () => {
  it('conosce i tre versi e nient altro', () => {
    expect(CANVAS_EDGE_KINDS).toEqual(['derives_from', 'responds_to', 'groups_with']);
  });

  it('riconosce un verso che il database accetterebbe', () => {
    expect(isCanvasEdgeKind('responds_to')).toBe(true);
  });

  it('rifiuta un verso inventato, invece di lasciarlo arrivare al check', () => {
    expect(isCanvasEdgeKind('nasce_da')).toBe(false);
  });

  it('porta gli estremi dove SvelteFlow li cerca', () => {
    const [edge] = toFlowEdges([row()]);

    expect(edge.id).toBe('e1');
    expect(edge.source).toBe('a');
    expect(edge.target).toBe('b');
  });

  it('mostra la didascalia scritta da una persona quando c e', () => {
    const [edge] = toFlowEdges([row({ label: 'dal brief di marzo' })]);

    expect(edge.label).toBe('dal brief di marzo');
  });

  it('senza didascalia non lascia la linea muta: dice il verso', () => {
    // Una linea senza etichetta costringe a indovinare perché due cose sono unite, ed è
    // esattamente l'informazione per cui l'arco esiste.
    const [edge] = toFlowEdges([row({ kind: 'groups_with' })]);

    expect(edge.label).toBe('insieme a');
  });

  it('solo `groups_with` perde la freccia: gli altri due hanno un verso', () => {
    const [grouped] = toFlowEdges([row({ kind: 'groups_with' })]);
    const [derived] = toFlowEdges([row({ kind: 'derives_from' })]);

    expect(grouped.markerEnd).toBeUndefined();
    expect(derived.markerEnd).toBeDefined();
  });
});
