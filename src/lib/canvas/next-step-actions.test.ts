import { describe, expect, it } from 'vitest';
import { actionsFor, NEXT_STEP_ACTIONS } from './next-step-actions';

describe('NEXT_STEP_ACTIONS', () => {
  it('only lists node types that exist on the canvas', () => {
    const validTypes = new Set([
      'text',
      'image',
      'video',
      'doc',
      'iframe',
      'social_account_feed',
      'social_post_mockup',
      'products',
      'ads',
      'influencer'
    ]);

    for (const action of NEXT_STEP_ACTIONS) {
      for (const type of action.appliesTo) {
        expect(validTypes.has(type)).toBe(true);
      }
      if (action.createsNodeType) {
        expect(validTypes.has(action.createsNodeType)).toBe(true);
      }
    }
  });

  it('every action id is unique', () => {
    const ids = NEXT_STEP_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('actionsFor', () => {
  it('returns only actions valid for an image node', () => {
    const actions = actionsFor('image');
    expect(actions.map((a) => a.id)).toEqual(
      expect.arrayContaining(['animate-into-video', 'write-caption', 'loop-variants', 'create-post', 'describe-image', 'resize-for-stories'])
    );
    expect(actions.some((a) => a.id === 'translate')).toBe(false);
  });

  it('returns only actions valid for a text node', () => {
    const actions = actionsFor('text');
    expect(actions.map((a) => a.id)).toEqual(expect.arrayContaining(['translate', 'create-post']));
    expect(actions.some((a) => a.id === 'animate-into-video')).toBe(false);
  });

  it('returns nothing for a node type with no defined actions', () => {
    expect(actionsFor('products')).toEqual([]);
  });
});
