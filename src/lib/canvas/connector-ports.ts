import { isListValued, type ConnectorType } from './connectors';

type PortEdge = { id: string; target: string; targetHandle: string | null };

export function connectorOccupied(edges: PortEdge[], targetId: string, connector: ConnectorType): boolean {
  return edges.some((e) => e.target === targetId && e.targetHandle === connector);
}

export function connectorAccepts(
  edges: PortEdge[],
  targetId: string,
  connector: ConnectorType,
  listValued: boolean = isListValued(connector),
  ignoreEdgeId?: string
): boolean {
  if (listValued) return true;

  const occupying = edges.filter(
    (e) => e.target === targetId && e.targetHandle === connector && e.id !== ignoreEdgeId
  );
  return occupying.length === 0;
}

export function nodeAcceptsConnection(edges: PortEdge[], targetId: string, nodeType: string): boolean {
  if (nodeType !== 'effects') {
    return true;
  }

  return !edges.some((edge) => edge.target === targetId);
}
