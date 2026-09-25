import type { Db } from '$lib/server/db/client';
import { NEXT_STEP_ACTIONS, type NextStepActionId } from '$lib/canvas/next-step-actions';

const HISTORY_SAMPLE_SIZE = 500;

export async function actionFrequencyFor(db: Db, orgId: string, sourceNodeType: string): Promise<Record<string, number>> {
  const { data: connections } = await db
    .from('nodes_connections')
    .select('target_node_id, source_node_id')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .limit(HISTORY_SAMPLE_SIZE);

  if (!connections?.length) return {};

  const sourceIds = [...new Set(connections.map((c) => c.source_node_id))];
  const targetIds = [...new Set(connections.map((c) => c.target_node_id))];

  const { data: nodes } = await db
    .from('nodes')
    .select('id, type')
    .in('id', [...sourceIds, ...targetIds]);

  const typeById = new Map((nodes ?? []).map((n) => [n.id, n.type]));

  const frequency: Partial<Record<NextStepActionId, number>> = {};
  for (const connection of connections) {
    if (typeById.get(connection.source_node_id) !== sourceNodeType) continue;

    const targetType = typeById.get(connection.target_node_id);
    if (!targetType) continue;

    for (const action of NEXT_STEP_ACTIONS) {
      if (action.createsNodeType === targetType) {
        frequency[action.id] = (frequency[action.id] ?? 0) + 1;
      }
    }
  }

  return frequency;
}
