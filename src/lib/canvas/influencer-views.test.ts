import { describe, expect, it } from 'vitest';
import { FACE_FRONT_VIEW, INFLUENCER_VIEWS, influencerViewByKey } from './influencer-views';

describe('INFLUENCER_VIEWS — le 7 viste importate da anomalia', () => {
  it('ha esattamente le 7 chiavi di talent_views, nel loro sort_order', () => {
    expect(INFLUENCER_VIEWS.map((v) => v.key)).toEqual([
      'face-front',
      'body-front',
      'face-three-quarter',
      'face-profile',
      'hands-detail',
      'body-three-quarter',
      'body-back'
    ]);
  });

  it('ogni chiave è unica', () => {
    const keys = INFLUENCER_VIEWS.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ogni vista ha un frammento di prompt non vuoto', () => {
    for (const view of INFLUENCER_VIEWS) {
      expect(view.promptFragment.trim().length).toBeGreaterThan(0);
    }
  });

  it('la prima vista è il volto frontale — quella generata per prima', () => {
    expect(FACE_FRONT_VIEW.key).toBe('face-front');
    expect(INFLUENCER_VIEWS[0]).toBe(FACE_FRONT_VIEW);
  });

  it('influencerViewByKey trova una vista nota e non una sconosciuta', () => {
    expect(influencerViewByKey('face-profile')?.label).toBe('Face · Profile');
    expect(influencerViewByKey('nose-ring')).toBeUndefined();
  });
});
