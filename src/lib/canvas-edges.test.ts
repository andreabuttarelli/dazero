import { describe, it, expect } from 'vitest';
import {
  CANVAS_EDGE_KINDS,
  EDGE_KIND_LABEL,
  isCanvasEdgeKind,
  toFlowEdges,
  type CanvasEdgeRow
} from './canvas-edges';

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

  it('non disegna niente sulla linea, con o senza didascalia', () => {
    const [withCaption] = toFlowEdges([row({ label: 'dal brief di marzo' })]);
    const [withoutCaption] = toFlowEdges([row({ kind: 'groups_with' })]);

    expect(withCaption.label).toBeUndefined();
    expect(withoutCaption.label).toBeUndefined();
  });

  it('solo `groups_with` perde la freccia: gli altri due hanno un verso', () => {
    const [grouped] = toFlowEdges([row({ kind: 'groups_with' })]);
    const [derived] = toFlowEdges([row({ kind: 'derives_from' })]);

    expect(grouped.markerEnd).toBeUndefined();
    expect(derived.markerEnd).toBeDefined();
  });
});

/**
 * LA LINEA DEVE SAPER DIRE CHE VERSO È, senza disegnare niente addosso a sé: il `kind` viaggia
 * sull'arco per il menù che lo cambia al clic, la linea stessa resta muta.
 */
describe('il verso viaggia con la linea, mai come testo sopra di lei', () => {
  it("ogni arco disegnato porta il proprio `kind`", () => {
    const [edge] = toFlowEdges([row({ kind: 'responds_to', label: 'la mia didascalia' })]);

    expect(edge.kind).toBe('responds_to');
    expect(edge.label).toBeUndefined();
  });

  it('le etichette dei tre versi si leggono da fuori: due elenchi divergerebbero', () => {
    expect(Object.keys(EDGE_KIND_LABEL).sort()).toEqual([...CANVAS_EDGE_KINDS].sort());
  });
});
