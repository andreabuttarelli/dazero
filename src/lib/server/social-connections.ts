import type { SupabaseClient } from '@supabase/supabase-js';
import { orgCreditBalance } from '$lib/server/credits';
import { ACCOUNT_SEAT_CREDITS } from '$lib/server/credit-ladder';

/**
 * Lo stato del collegamento social di un brand, letto una volta sola.
 *
 * Esiste perché la stessa domanda — "su quali piattaforme questo brand pubblica davvero?" — la
 * fanno due tool (`get_brand_settings` e `list_social_accounts`) e la rotta che conia il link. Con
 * tre letture separate le tre risposte divergono al primo cambiamento, e un agente che ne sente
 * due diverse non sa più a quale credere.
 *
 * `active` è l'unico stato che pubblica. Gli altri valori che il sync deposita (`disconnected`, e
 * quelli che una piattaforma può restituire scaduti o revocati) non vengono enumerati qui: la
 * riga c'è ma nessuna è attiva, e questo basta a dire che la piattaforma va riautorizzata.
 *
 * Non ci sono più piani (`brands.plan`/`.status` non esistono sullo schema nuovo): collegare un
 * account è gated dal saldo crediti dell'org, lo stesso conto che paga il canone mensile
 * (`account-billing.ts`, `ACCOUNT_SEAT_CREDITS`). `slots.limit` non è più un tetto di piano — è
 * quanti account l'org può sostenere ORA con il saldo che ha, account già pagati compresi.
 */

const ACTIVE = 'active';

export type SocialAccount = {
  platform: string;
  username: string | null;
  display_name: string | null;
  profile_url: string | null;
  status: string;
  connected_at: string | null;
};

export type SocialConnections = {
  accounts: SocialAccount[];
  connected: string[];
  broken: string[];
  canConnect: boolean;
  slots: { used: number; limit: number };
};

type BrandRef = { id: string; org_id: string };

const norm = (value: unknown): string => String(value ?? '').toLowerCase().trim();

const unique = (platforms: string[]): string[] => [...new Set(platforms)].filter(Boolean);

/** Quanti account IN PIÙ un saldo copre, un mese a testa. L'unico posto che fa questa divisione. */
export const affordableSeats = (balance: number): number =>
  Math.max(0, Math.floor(balance / ACCOUNT_SEAT_CREDITS));

export async function socialConnections(
  supabase: SupabaseClient,
  brand: BrandRef
): Promise<SocialConnections> {
  const { data, error } = await supabase
    .from('social_accounts')
    .select('platform, handle, display_name, status, connected_at')
    .eq('brand_id', brand.id)
    .order('connected_at', { ascending: true });
  if (error) throw error;

  const accounts: SocialAccount[] = (data ?? []).map((row) => ({
    platform: norm(row.platform),
    username: row.handle ?? null,
    display_name: row.display_name ?? null,
    profile_url: null,
    status: norm(row.status) || ACTIVE,
    connected_at: row.connected_at ?? null
  }));

  const connected = unique(accounts.filter((a) => a.status === ACTIVE).map((a) => a.platform));
  const broken = unique(accounts.map((a) => a.platform)).filter((p) => !connected.includes(p));

  const used = accounts.filter((a) => a.status === ACTIVE).length;
  const balance = await orgCreditBalance(supabase, brand.org_id);
  const seats = affordableSeats(balance);

  return {
    accounts,
    connected,
    broken,
    canConnect: seats > 0,
    slots: {
      used,
      limit: used + seats
    }
  };
}

/**
 * Il cancello vero e proprio: l'org può permettersi il canone del primo mese di UN account in
 * più? Le rotte di connessione (API + le tre pagine headless Facebook/LinkedIn/generica) lo
 * chiamano prima di attraversare l'OAuth — un solo posto che legge il saldo, mai un secondo
 * conto che può disallinearsi da `socialConnections`.
 */
export async function canAffordSeat(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const balance = await orgCreditBalance(supabase, orgId);
  return balance >= ACCOUNT_SEAT_CREDITS;
}

/** Dove una persona collega una piattaforma. Non è un OAuth: è una pagina dietro la sua login. */
export const connectPath = (projectId: string, platform: string): string =>
  `/p/${encodeURIComponent(projectId)}/settings/connect/${encodeURIComponent(platform)}`;

/** Dove una persona sincronizza o scollega. Nessun tool scollega: si attraversa, non si esegue. */
export const managePath = (projectId: string): string =>
  `/p/${encodeURIComponent(projectId)}/settings/connected-accounts`;
