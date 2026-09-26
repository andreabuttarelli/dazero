export type WorkflowEdge = { sourceNodeId: string; targetNodeId: string };

export type WorkflowStep = { nodeId: string; dependsOn: string[] };

export type WorkflowPlanResult =
  | { ok: true; steps: WorkflowStep[] }
  | { ok: false; reason: string };

const GENERATIVE_TYPES = new Set(['text', 'image', 'video']);

function adjacency(selectedIds: string[], edges: WorkflowEdge[]) {
  const selected = new Set(selectedIds);
  const dependsOn = new Map<string, Set<string>>();
  const neighbors = new Map<string, Set<string>>();
  for (const id of selectedIds) {
    dependsOn.set(id, new Set());
    neighbors.set(id, new Set());
  }

  for (const edge of edges) {
    if (!selected.has(edge.sourceNodeId) || !selected.has(edge.targetNodeId)) continue;
    dependsOn.get(edge.targetNodeId)!.add(edge.sourceNodeId);
    neighbors.get(edge.sourceNodeId)!.add(edge.targetNodeId);
    neighbors.get(edge.targetNodeId)!.add(edge.sourceNodeId);
  }

  return { dependsOn, neighbors };
}

function isConnected(selectedIds: string[], neighbors: Map<string, Set<string>>): boolean {
  if (selectedIds.length === 0) return true;

  const seen = new Set([selectedIds[0]]);
  const queue = [selectedIds[0]];
  while (queue.length) {
    const current = queue.pop()!;
    for (const next of neighbors.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return seen.size === selectedIds.length;
}

function topologicalOrder(
  selectedIds: string[],
  dependsOn: Map<string, Set<string>>
): WorkflowStep[] | null {
  const remaining = new Set(selectedIds);
  const ordered: WorkflowStep[] = [];

  while (remaining.size) {
    const ready = [...remaining].filter((id) => [...dependsOn.get(id)!].every((dep) => !remaining.has(dep)));
    if (!ready.length) return null;

    for (const id of ready) {
      ordered.push({ nodeId: id, dependsOn: [...dependsOn.get(id)!] });
      remaining.delete(id);
    }
  }

  return ordered;
}

export function planWorkflow(
  selectedIds: string[],
  edges: WorkflowEdge[],
  nodeTypesById: Map<string, string>
): WorkflowPlanResult {
  if (selectedIds.length < 2) {
    return { ok: false, reason: 'servono almeno due nodi selezionati' };
  }

  const nonGenerative = selectedIds.find((id) => !GENERATIVE_TYPES.has(nodeTypesById.get(id) ?? ''));
  if (nonGenerative) {
    return { ok: false, reason: `il nodo ${nonGenerative} non è un nodo di generazione` };
  }

  const { dependsOn, neighbors } = adjacency(selectedIds, edges);

  if (!isConnected(selectedIds, neighbors)) {
    return { ok: false, reason: 'i nodi selezionati non sono tutti collegati fra loro' };
  }

  const steps = topologicalOrder(selectedIds, dependsOn);
  if (!steps) {
    return { ok: false, reason: 'i collegamenti formano un ciclo' };
  }

  return { ok: true, steps };
}

export type StepStatus = 'done' | 'failed' | 'expired' | 'running' | 'finishing';

export type StepReadiness = 'ready' | 'waiting' | 'blocked';

export function stepReadiness(dependsOnStatuses: StepStatus[]): StepReadiness {
  if (dependsOnStatuses.some((s) => s === 'failed' || s === 'expired')) {
    return 'blocked';
  }
  if (dependsOnStatuses.every((s) => s === 'done')) {
    return 'ready';
  }
  return 'waiting';
}
