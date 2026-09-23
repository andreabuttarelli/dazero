import { describe, expect, it } from 'vitest';
import { mapTalent, mapTalentView, type OldTalentRow, type OldTalentViewRow } from './import-anomalia-talents';

const talentRow = (over: Partial<OldTalentRow> = {}): OldTalentRow => ({
  id: 't1',
  slug: 'valeria',
  name: 'Valeria',
  gender: 'woman',
  age: 29,
  body_type: 'athletic',
  ethnicity: 'latin-american',
  summary: 'A summary',
  traits: { eyeColor: 'brown' },
  status: 'active',
  height_band: 'average',
  ...over
});

const viewRow = (over: Partial<OldTalentViewRow> = {}): OldTalentViewRow => ({
  id: 'v1',
  talent_id: 't1',
  view_key: 'face-front',
  label: 'Viso · Frontale',
  aspect_ratio: '3:4',
  path: 'valeria/face-front.webp',
  mime_type: 'image/webp',
  width: 1024,
  height: 1365,
  bytes: 45000,
  sort_order: 10,
  ...over
});

describe('mapTalent — un talent anomalia diventa un influencer di catalogo', () => {
  it('porta ogni campo, con source catalogue e actor system', () => {
    const mapped = mapTalent(talentRow());
    expect(mapped).toEqual({
      slug: 'valeria',
      name: 'Valeria',
      gender: 'woman',
      age: 29,
      ethnicity: 'latin-american',
      bodyType: 'athletic',
      heightBand: 'average',
      summary: 'A summary',
      traits: { eyeColor: 'brown' },
      source: 'catalogue',
      actorKind: 'system',
      actorId: null
    });
  });

  it('un talent non active viene saltato, non importato', () => {
    expect(mapTalent(talentRow({ status: 'archived' }))).toBeNull();
  });

  it('traits null diventa un oggetto vuoto, mai null nel catalogo nuovo', () => {
    expect(mapTalent(talentRow({ traits: null }))?.traits).toEqual({});
  });
});

describe('mapTalentView — una vista anomalia diventa una vista influencer', () => {
  it('porta view_key, label, aspect_ratio, path e ordine', () => {
    expect(mapTalentView(viewRow())).toEqual({
      viewKey: 'face-front',
      label: 'Viso · Frontale',
      aspectRatio: '3:4',
      oldPath: 'valeria/face-front.webp',
      mimeType: 'image/webp',
      width: 1024,
      height: 1365,
      sortOrder: 10
    });
  });
});
