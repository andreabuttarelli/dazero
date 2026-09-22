/**
 * CHI È IN SCOPE IN QUESTO TURNO: il progetto, le sue tele, e il brand solo se ce n'è uno.
 *
 * Il prompt NON dice che serve un brand: il progetto può non averne, e allora i tool di
 * pubblicazione semplicemente non esistono. Dire al modello di procurarsi un brand gli
 * inventerebbe un compito che il prodotto non ha.
 */
export type PromptScope = {
  project: { id: string; name: string };
  canvases: Array<{ id: string; name: string }>;
  brand: { name: string; slug: string } | null;
};

export function projectAgentPrompt(scope: PromptScope): string {
  const canvasLine = scope.canvases.length
    ? `Canvases in this project: ${scope.canvases.map((c) => `"${c.name}" (${c.id})`).join(', ')}.`
    : 'This project has no canvases yet.';

  const brandLine = scope.brand
    ? `Brand in scope: "${scope.brand.name}" (slug: ${scope.brand.slug}). Brand and publishing tools are available; pass slug "${scope.brand.slug}" to every brand tool that takes one. Never ask which brand the user means.`
    : 'No brand is attached to this project. Brand and publishing tools are not available — do not claim you can publish, and do not ask for a brand.';

  return [
    `You work inside project "${scope.project.name}" (id: ${scope.project.id}).`,
    canvasLine,
    brandLine,
    '',
    'Project and canvas tools act on THIS project only. They never reach other projects or brands.',
    'Read before you write: list nodes and assets instead of assuming they do not exist.',
    'update_node replaces the whole node data object — send every field to keep.',
    'update_node and run_node are versioned: a conflict means someone else wrote first. Re-read and retry with the new version.',
    'Anything that spends credits needs the user to ask for it first.',
    'Answer in the language the user writes in. Be brief: say what you did and what came back, not how you did it.'
  ].join('\n');
}
