import type { User } from '@supabase/supabase-js';
import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';

/**
 * IL PROFILO È LA PERSONA, E IL SUO ID È QUELLO DI AUTH.
 *
 * `profiles.id` referenzia `auth.users(id)`: due id per la stessa persona divergono al primo bug,
 * quindi non ce ne sono due. La riga nasce al primo accesso — la policy `own_profile` la difende
 * con `id = auth.uid()`, per cui l'utente scrive la propria e nessun'altra: qui la chiave anon
 * basta, e la service role non serve.
 */
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

const PROFILE_COLUMNS = 'id, email, name, avatar_url';

type ProfileColumns = Pick<ProfileRow, 'id' | 'email' | 'name' | 'avatar_url'>;

function toProfile(row: ProfileColumns): Profile {
  return { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url };
}

/** I nomi che i provider usano per la stessa cosa, dichiarati qui invece che in un `if` per volta. */
const NAME_KEYS = ['full_name', 'name'] as const;
const AVATAR_KEYS = ['avatar_url', 'picture'] as const;

function firstString(metadata: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return null;
}

export function profileFromAuthUser(user: User): Profile {
  if (!user.email) {
    throw new Error(`utente senza email: profiles.email non la accetta (${user.id})`);
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

  return {
    id: user.id,
    email: user.email,
    name: firstString(metadata, NAME_KEYS),
    avatarUrl: firstString(metadata, AVATAR_KEYS)
  };
}

export async function ensureProfile(db: Db, user: User): Promise<Profile> {
  const profile = profileFromAuthUser(user);

  const { data, error } = await db
    .from('profiles')
    .upsert(
      {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        avatar_url: profile.avatarUrl,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    )
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toProfile(data);
}
