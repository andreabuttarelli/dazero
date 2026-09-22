import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deleteBrand } from '$lib/server/settings-actions';
import { hasManyTenants } from '$lib/server/tenancy';
import { requireBrand } from '$lib/server/projects/brand-shell';

// Cancellare l'unico brand mura l'installazione: la riga sparisce, TENANT_BRAND_ID resta a
// puntarla, e ogni pagina risponde 500 con "esegui il seed". Non è una scelta che vada offerta.
// Chi vuole ricominciare rifà il seed, non preme un bottone che lascia l'app senza uscita.
export const load: PageServerLoad = async ({ parent }) => {
  if (!hasManyTenants()) throw error(404, 'Not found');
  const { brand: brandOrNull } = await parent();
  return { brand: requireBrand(brandOrNull) };
};

export const actions: Actions = { deleteBrand };
