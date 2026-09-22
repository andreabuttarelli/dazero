import { describe, expect, it } from 'vitest';
import { ORG_COOKIE, chooseOrg } from '$lib/server/tenancy/context';
import type { Membership } from '$lib/server/repos/orgs';

const org = (id: string, slug: string): Membership => ({
  org: { id, name: slug, slug },
  role: 'member'
});

const ONE = org('11111111-1111-1111-1111-111111111111', 'uno');
const TWO = org('22222222-2222-2222-2222-222222222222', 'due');

describe('quale org sta guardando', () => {
  it('nessuna appartenenza: nessuna org, e il chiamante lo vede', () => {
    expect(chooseOrg([], null)).toBeNull();
  });

  it('una sola appartenenza: quella, senza chiedere niente a nessuno', () => {
    expect(chooseOrg([ONE], null)).toEqual(ONE);
  });

  it('più appartenenze: quella scelta, che arriva dal cookie', () => {
    expect(chooseOrg([ONE, TWO], TWO.org.id)).toEqual(TWO);
  });

  it('un id scelto che non è suo non gliela dà: torna alla prima', () => {
    expect(chooseOrg([ONE, TWO], '99999999-9999-9999-9999-999999999999')).toEqual(ONE);
  });

  it('senza scelta con più org, la prima: una pagina si apre sempre', () => {
    expect(chooseOrg([ONE, TWO], null)).toEqual(ONE);
  });

  it("il cookie di un'org lasciata non la riapre", () => {
    expect(chooseOrg([TWO], ONE.org.id)).toEqual(TWO);
  });

  it('il nome del cookie è uno solo, e sta qui', () => {
    expect(ORG_COOKIE).toBe('dz-org');
  });
});
