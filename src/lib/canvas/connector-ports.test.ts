import { describe, expect, it } from 'vitest';
import { connectorOccupied, connectorAccepts, nodeAcceptsConnection } from './connector-ports';

type Edge = { id: string; source: string; target: string; targetHandle: string | null };

const edge = (id: string, target: string, targetHandle: string | null, source = 'src'): Edge => ({
  id,
  source,
  target,
  targetHandle
});

describe('nodeAcceptsConnection', () => {
  it('effects rifiuta qualsiasi secondo media, anche su una porta diversa', () => {
    const edges = [edge('e1', 'fx', 'images')];
    expect(nodeAcceptsConnection(edges, 'fx', 'effects')).toBe(false);
  });

  it('effects accetta il primo media', () => {
    expect(nodeAcceptsConnection([], 'fx', 'effects')).toBe(true);
  });
});

describe('connectorOccupied — un connettore a valore singolo porta un filo solo', () => {
  it('libero senza archi su quella maniglia', () => {
    expect(connectorOccupied([], 'n1', 'first_frame')).toBe(false);
  });

  it('occupato quando un arco è già attaccato a quella maniglia su quel nodo', () => {
    const edges = [edge('e1', 'n1', 'first_frame')];
    expect(connectorOccupied(edges, 'n1', 'first_frame')).toBe(true);
  });

  it('un arco su un\'altra maniglia dello stesso nodo non lo occupa', () => {
    const edges = [edge('e1', 'n1', 'last_frame')];
    expect(connectorOccupied(edges, 'n1', 'first_frame')).toBe(false);
  });

  it('un arco identico su un altro nodo non lo occupa', () => {
    const edges = [edge('e1', 'n2', 'first_frame')];
    expect(connectorOccupied(edges, 'n1', 'first_frame')).toBe(false);
  });
});

describe('connectorAccepts — se una nuova linea può atterrare su questa porta', () => {
  it('un connettore a valore multiplo accetta sempre un filo in più', () => {
    const edges = [edge('e1', 'n1', 'images'), edge('e2', 'n1', 'images')];
    expect(connectorAccepts(edges, 'n1', 'images', true)).toBe(true);
  });

  it('un connettore a valore singolo libero accetta', () => {
    expect(connectorAccepts([], 'n1', 'first_frame', false)).toBe(true);
  });

  it('un connettore a valore singolo già occupato rifiuta un secondo filo', () => {
    const edges = [edge('e1', 'n1', 'first_frame')];
    expect(connectorAccepts(edges, 'n1', 'first_frame', false)).toBe(false);
  });

  it('un connettore a valore singolo occupato dallo STESSO arco riconnesso non si rifiuta da solo', () => {
    const edges = [edge('e1', 'n1', 'first_frame')];
    expect(connectorAccepts(edges, 'n1', 'first_frame', false, 'e1')).toBe(true);
  });
});
