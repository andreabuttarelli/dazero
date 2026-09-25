import { imageCraftFor } from '$lib/design/image-craft';
import { videoCraftFor } from '$lib/design/video-craft';
import { llmText } from '$lib/server/llm';

export type EnhanceMedium = 'image' | 'video';

export type EnhancePromptInput = {
  medium: EnhanceMedium;
  model: string;
  prompt: string;
  context?: string;
};

export type EnhancePromptOutput = { prompt: string };

const GENERIC_CRAFT: Record<EnhanceMedium, string> = {
  image: 'MODEL NOTES — generic image guidance. Write in English, describe subject, composition, lighting and style concretely.',
  video: 'MODEL NOTES — generic video guidance. Write in English, describe subject, action, camera and setting concretely.'
};

function craftFor(medium: EnhanceMedium, model: string): string {
  const craft = medium === 'image' ? imageCraftFor(model) : videoCraftFor(model);
  return craft || GENERIC_CRAFT[medium];
}

function systemPromptFor(input: EnhancePromptInput): string {
  const craft = craftFor(input.medium, input.model);
  const contextLine = input.context ? `\nBrand context (facts you may use, never invent new ones): ${input.context}` : '';
  return `You rewrite a user's ${input.medium} generation prompt to follow the model's own best practices below. Keep the user's intent, subject and meaning exactly. Write in the language the model expects — most models expect English, unless the craft notes below say otherwise. Never invent brand facts. Return only the rewritten prompt, nothing else.

${craft}${contextLine}`;
}

export async function enhancePrompt(input: EnhancePromptInput): Promise<EnhancePromptOutput> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { prompt: input.prompt };
  }

  const { text } = await llmText({
    prompt,
    system: systemPromptFor(input),
    label: 'prompt.enhance'
  });

  return { prompt: text.trim() };
}
