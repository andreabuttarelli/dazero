export type NextStepActionId =
  | 'animate-into-video'
  | 'write-caption'
  | 'loop-variants'
  | 'create-post'
  | 'describe-image'
  | 'translate'
  | 'resize-for-stories';

export type NextStepAction = {
  id: NextStepActionId;
  label: string;
  createsNodeType: 'video' | 'text' | 'image' | null;
  wiring: 'connect-new' | 'create-post';
  promptTemplate: string;
  appliesTo: readonly string[];
};

export const NEXT_STEP_ACTIONS: readonly NextStepAction[] = [
  {
    id: 'animate-into-video',
    label: 'Animate into a video',
    createsNodeType: 'video',
    wiring: 'connect-new',
    promptTemplate: 'Animate this image into a short video',
    appliesTo: ['image']
  },
  {
    id: 'write-caption',
    label: 'Write a caption',
    createsNodeType: 'text',
    wiring: 'connect-new',
    promptTemplate: 'Write a social caption for this',
    appliesTo: ['image', 'video']
  },
  {
    id: 'loop-variants',
    label: 'Generate variants',
    createsNodeType: 'image',
    wiring: 'connect-new',
    promptTemplate: 'Generate a variant of this image',
    appliesTo: ['image']
  },
  {
    id: 'create-post',
    label: 'Create post',
    createsNodeType: null,
    wiring: 'create-post',
    promptTemplate: '',
    appliesTo: ['image', 'video', 'text', 'doc']
  },
  {
    id: 'describe-image',
    label: 'Describe this image',
    createsNodeType: 'text',
    wiring: 'connect-new',
    promptTemplate: 'Describe what is shown in this image',
    appliesTo: ['image']
  },
  {
    id: 'translate',
    label: 'Translate',
    createsNodeType: 'text',
    wiring: 'connect-new',
    promptTemplate: 'Translate this text into English',
    appliesTo: ['text', 'doc']
  },
  {
    id: 'resize-for-stories',
    label: 'Resize for Stories',
    createsNodeType: 'image',
    wiring: 'connect-new',
    promptTemplate: 'Resize this into a 9:16 vertical format',
    appliesTo: ['image']
  }
] as const;

export function actionsFor(nodeType: string): readonly NextStepAction[] {
  return NEXT_STEP_ACTIONS.filter((action) => action.appliesTo.includes(nodeType));
}
