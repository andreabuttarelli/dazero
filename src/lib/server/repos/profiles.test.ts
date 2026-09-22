import { describe, expect, it } from 'vitest';
import { ensureProfile, profileFromAuthUser } from '$lib/server/repos/profiles';
import { fakeDb } from '$lib/server/db/fake-db';
import type { User } from '@supabase/supabase-js';

const USER = '11111111-1111-1111-1111-111111111111';

const authUser = (metadata: Record<string, unknown>): User =>
  ({ id: USER, email: 'chi@esempio.it', user_metadata: metadata }) as unknown as User;

const row = {
  id: USER,
  email: 'chi@esempio.it',
  name: 'Chi Esempio',
  avatar_url: 'https://esempio.it/a.png'
};

describe('il profilo si ricava dall utente di auth', () => {
  it('prende il nome da full_name', () => {
    expect(profileFromAuthUser(authUser({ full_name: 'Chi Esempio' })).name).toBe('Chi Esempio');
  });

  it('ripiega su name quando full_name non c è', () => {
    expect(profileFromAuthUser(authUser({ name: 'Chi' })).name).toBe('Chi');
  });

  it('senza nome resta null, non una stringa vuota', () => {
    expect(profileFromAuthUser(authUser({})).name).toBeNull();
  });

  it("l'avatar arriva da avatar_url o da picture", () => {
    expect(profileFromAuthUser(authUser({ picture: 'https://p/1.png' })).avatarUrl).toBe('https://p/1.png');
    expect(profileFromAuthUser(authUser({ avatar_url: 'https://a/1.png' })).avatarUrl).toBe('https://a/1.png');
  });

  it('un utente senza email non produce un profilo: la colonna non lo accetta', () => {
    const anonymous = { id: USER, email: null, user_metadata: {} } as unknown as User;

    expect(() => profileFromAuthUser(anonymous)).toThrow();
  });
});

describe('il profilo nasce al primo accesso', () => {
  it('scrive la riga sull id di auth, che è la stessa persona', async () => {
    const { db, calls } = fakeDb({ profiles: [row] });

    await ensureProfile(db, authUser({ full_name: 'Chi Esempio', picture: 'https://esempio.it/a.png' }));

    const upsert = calls.find((c) => c.op === 'upsert')!;
    expect(upsert.payload).toMatchObject({
      id: USER,
      email: 'chi@esempio.it',
      name: 'Chi Esempio',
      avatar_url: 'https://esempio.it/a.png'
    });
  });

  it('restituisce la forma di dominio, non la riga', async () => {
    const { db } = fakeDb({ profiles: [row] });

    expect(await ensureProfile(db, authUser({ full_name: 'Chi Esempio' }))).toEqual({
      id: USER,
      email: 'chi@esempio.it',
      name: 'Chi Esempio',
      avatarUrl: 'https://esempio.it/a.png'
    });
  });
});
