import { describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { load } from './+page.server';

const ORIGIN = 'https://dazero.co';
const SIGNED_IN = { session: { access_token: 'jwt' }, user: { id: 'u1' } };

function run(path: string) {
  const url = new URL(`${ORIGIN}${path}`);
  const event = {
    url,
    cookies: {
      get: () => undefined,
      delete: () => undefined
    },
    locals: { safeGetSession: async () => SIGNED_IN }
  };

  return Promise.resolve((load as any)(event)).then(
    () => null,
    (error) => {
      if (isRedirect(error)) return { status: error.status, location: error.location };
      throw error;
    }
  );
}

describe('login page load', () => {
  // L'onboarding non esiste più: entrare è un bootstrap silenzioso, e /app è l'unica porta.
  // I parametri che servivano a preparare il modulo non hanno più un modulo da preparare.
  it('manda chi è già dentro all app, qualunque parametro porti', async () => {
    await expect(run('/login?website=acme.example')).resolves.toEqual({
      status: 303,
      location: '/app'
    });
  });

  it('non fa eccezione per next=onboarding, che non porta più da nessuna parte', async () => {
    await expect(run('/login?next=onboarding')).resolves.toEqual({
      status: 303,
      location: '/app'
    });
  });
});
