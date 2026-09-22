import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** La home di un progetto è la sua prima tela: niente dashboard intermedia da attraversare. */
export const load: PageServerLoad = async ({ parent }) => {
  const data = await parent();
  const first = data.canvases[0];
  if (first) {
    throw redirect(302, `/p/${data.project.id}/c/${first.id}`);
  }
  throw redirect(302, '/app');
};
