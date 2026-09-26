import { describe, expect, it } from 'vitest';
import { fakeDb, filtersOf } from '$lib/server/db/fake-db';
import { listOrgBrands } from './brands';

const ORG = 'org-1';

const row = {
  id: 'brand-1',
  org_id: ORG,
  name: 'Demo',
  slug: 'demo',
  website: 'https://demo.example',
  short_description: 'A demo brand',
  logo_url: null
};

describe('listOrgBrands', () => {
  it('scopa per org, mai per un altra colonna', async () => {
    const { db, calls } = fakeDb({ brands: [row] });

    await listOrgBrands(db, ORG);

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG });
  });

  it('non seleziona colonne che nel database nuovo non esistono', async () => {
    const { db } = fakeDb({ brands: [row] });

    const brands = await listOrgBrands(db, ORG);

    expect(brands).toEqual([
      { id: 'brand-1', name: 'Demo', slug: 'demo', website: 'https://demo.example', shortDescription: 'A demo brand', logoUrl: null }
    ]);
  });
});
