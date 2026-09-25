import { actionsFor, type NextStepAction, type NextStepActionId } from './next-step-actions';
import type { Decide, ChooseOneQuestion } from './decide';

export type NextStepSuggestion = { action: NextStepAction; confidence: number };

export const NEXT_STEP_CONFIDENCE_THRESHOLD = 0.3;

function rankByFrequency(actions: readonly NextStepAction[], frequency: Record<string, number>): NextStepSuggestion[] {
  const total = actions.reduce((sum, action) => sum + (frequency[action.id] ?? 0), 0);
  if (total === 0) {
    return actions.map((action) => ({ action, confidence: 1 / actions.length }));
  }
  return actions.map((action) => ({ action, confidence: (frequency[action.id] ?? 0) / total }));
}

function byConfidenceDesc(a: NextStepSuggestion, b: NextStepSuggestion): number {
  return b.confidence - a.confidence;
}

export function rankedFallback(nodeType: string, frequency: Record<string, number>): NextStepSuggestion[] {
  const valid = actionsFor(nodeType);
  if (!valid.length) return [];
  return rankByFrequency(valid, frequency).sort(byConfidenceDesc);
}

export async function suggestNextSteps(
  nodeType: string,
  frequency: Record<string, number>,
  decide: Decide | null
): Promise<NextStepSuggestion[]> {
  const fallback = rankedFallback(nodeType, frequency);
  if (!fallback.length) return [];

  const reranked = decide ? await rerankWithJev(fallback, decide) : fallback;

  return reranked.filter((s) => s.confidence >= NEXT_STEP_CONFIDENCE_THRESHOLD).sort(byConfidenceDesc);
}

async function rerankWithJev(fallback: NextStepSuggestion[], decide: Decide): Promise<NextStepSuggestion[]> {
  const validIds = new Set(fallback.map((s) => s.action.id));
  const options = fallback.map((s) => s.action.id);

  const question: ChooseOneQuestion = {
    kind: 'choose-one',
    instructions: 'Which of these actions is the most useful next step for this selected node?',
    options
  };

  const decision = await decide(question, { options });
  if (!decision || decision.kind !== 'choose-one') return fallback;

  const chosenId = decision.value as NextStepActionId;
  if (!validIds.has(chosenId)) return fallback;

  return fallback.map((s) => (s.action.id === chosenId ? { ...s, confidence: decision.confidence } : s));
}
