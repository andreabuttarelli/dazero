import type { Actions, PageServerLoad } from './$types';
import { sync, disconnect } from '$lib/server/settings-actions';
import { requireBrand } from '$lib/server/projects/brand-shell';

export const load: PageServerLoad = async ({ parent }) => {
  const { brand: brandOrNull } = await parent();
  return { brand: requireBrand(brandOrNull) };
};

export const actions: Actions = { sync, disconnect };
