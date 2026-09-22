import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminClient } from '$lib/server/supabase-admin';
import { docShareLive, hashShareToken } from '$lib/canvas/doc-node';
import { readSharedDoc } from '$lib/server/repos/doc-share';

/**
 * Rotta pubblica, senza sessione: il token È l'autorizzazione, come `/share/[token]`.
 *
 * Revocato, scaduto e mai esistito cadono tutti dallo stesso identico ramo — un 404 solo —
 * perché tre risposte diverse direbbero a chi prova un token quale caso ha trovato.
 */
export const load: PageServerLoad = async ({ params }) => {
  const tokenHash = await hashShareToken(params.token);
  const row = await readSharedDoc(createAdminClient(), tokenHash);
  const live = docShareLive(row, new Date());

  if (!live) {
    throw error(404, 'Not found');
  }

  return { content: live.content };
};
