import { redirect } from '@sveltejs/kit';
import { takeOAuthReturn } from '$lib/server/oauth';
import type { RequestHandler } from './$types';

// Scambia il codice del magic link / OAuth per una sessione, poi instrada. Le destinazioni sono
// due sole: chi stava facendo altro (consenso OAuth, login del CLI) torna lì, tutti gli altri
// all'app — che apre la tela da sé, senza parametri da portarsi dietro.
export const GET: RequestHandler = async ({ url, cookies, locals: { supabase } }) => {
  const code = url.searchParams.get('code');
  if (!code) {
    throw redirect(303, '/login');
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    throw redirect(303, '/login?error=link');
  }

  const oauthReturn = takeOAuthReturn(cookies);
  if (oauthReturn) {
    throw redirect(303, oauthReturn);
  }

  const cliPort = url.searchParams.get('cli_port') ?? '';
  const cliState = url.searchParams.get('cli_state') ?? '';
  if (cliPort) {
    throw redirect(
      303,
      `/cli/callback?cli_port=${encodeURIComponent(cliPort)}&cli_state=${encodeURIComponent(cliState)}`
    );
  }

  throw redirect(303, '/app');
};
