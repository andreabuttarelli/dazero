export type BooleanQuestion = { kind: 'boolean'; instructions: string };
export type ChooseOneQuestion = { kind: 'choose-one'; instructions: string; options: string[] };
export type ScoreQuestion = { kind: 'score'; instructions: string; levels: string[] };

export type TypedQuestion = BooleanQuestion | ChooseOneQuestion | ScoreQuestion;

export type DecisionState = string | Record<string, unknown> | unknown[];

export type Decision = { kind: TypedQuestion['kind']; value: boolean | string | number; confidence: number };

export type Decide = (question: TypedQuestion, state: DecisionState) => Promise<Decision | null>;
