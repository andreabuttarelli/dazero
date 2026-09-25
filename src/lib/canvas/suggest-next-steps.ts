import { actionsFor, type NextStepAction, type NextStepActionId } from './next-step-actions';
import type { Decide, ChooseOneQuestion } from './decide';

export type NextStepSuggestion = { action: NextStepAction; confidence: number };

export const NEXT_STEP_CONFIDENCE_THRESHOLD = 0.3;

const RANK_BASE_CONFIDENCE = 0.5;
const RANK_DECAY = 0.1;

/**
 * Il RANGO, non la quota — con sei azioni valide anche la più frequente vale 1/6 della torta, e
 * un valore in stile probabilità confonderebbe "poco popolare fra tante" con "non pertinente".
 * La frequenza ordina, la posizione decide la confidenza mostrata.
 */
function rankByFrequency(actions: readonly NextStepAction[], frequency: Record<string, number>): NextStepSuggestion[] {
  const byFrequencyDesc = [...actions].sort((a, b) => (frequency[b.id] ?? 0) - (frequency[a.id] ?? 0));
  return byFrequencyDesc.map((action, index) => ({
    action,
    confidence: Math.max(0, RANK_BASE_CONFIDENCE - index * RANK_DECAY)
  }));
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
