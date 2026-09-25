import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { EntryType, Question } from '@typesafe-ai/sdk';
import type { Decide, TypedQuestion, DecisionState, Decision } from '$lib/canvas/decide';

const JEV_TIMEOUT_MS = 5000;
const JEV_MODEL = 'jev-latest';
const NOUL_TRUE_THRESHOLD = 0.5;

function toJevQuestion(question: TypedQuestion): Record<string, unknown> {
  if (question.kind === 'boolean') {
    return { type: 'noul', instructions: question.instructions };
  }
  if (question.kind === 'choose-one') {
    const criteria = Object.fromEntries(question.options.map((option) => [option, null]));
    return { type: 'choice', instructions: question.instructions, criteria };
  }
  return { type: 'score', instructions: question.instructions, criteria: question.levels };
}

function toDecision(kind: TypedQuestion['kind'], answer: Record<string, unknown>): Decision | null {
  if (kind === 'boolean' && answer.type === 'noul') {
    const noul = answer.noul as number;
    return { kind, value: noul >= NOUL_TRUE_THRESHOLD, confidence: noul };
  }
  if (kind === 'choose-one' && answer.type === 'choice') {
    return { kind, value: answer.choice as string, confidence: answer.confidence as number };
  }
  if (kind === 'score' && answer.type === 'score') {
    return { kind, value: answer.score as number, confidence: answer.confidence as number };
  }
  return null;
}

export const decideWithJev: Decide = async (
  question: TypedQuestion,
  state: DecisionState
): Promise<Decision | null> => {
  if (!process.env.TYPESAFE_API_KEY) return null;

  try {
    const client = new TypeSafeClient();
    const response = await client.systemOne(
      { state: state as EntryType, model: JEV_MODEL, questions: { q: toJevQuestion(question) as unknown as Question } },
      { timeout: JEV_TIMEOUT_MS }
    );
    return toDecision(question.kind, response.answers.q as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
};
