import type { Db } from '$lib/server/db/client';
import { ACCOUNT_SEAT_CREDITS } from '$lib/server/credit-ladder';

/**
 * `credit_ledger.social_account_id` e `source = 'social_seat'` non sono nei tipi generati —
 * stessa ragione di free-org-limit.ts: la migration che li aggiunge (pendente,
 * 20260924_seat_fees_welcome_credits.sql) non è ancora passata da `npm run db:types` in questo
 * ambiente. Bordo dichiarato, non un giro libero su `unknown`.
 */
type SeatBillingDb = {
  rpc(fn: 'org_credit_balance', args: { _org_id: string }): PromiseLike<{ data: number | null; error: null }>;
  from(table: 'credit_ledger'): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { code?: string; message: string } | null }>;
  };
  from(table: 'social_accounts'): {
    select(cols: string): {
      eq(col: string, val: string): PromiseLike<{ data: { id: string; org_id: string }[] | null; error: { message: string } | null }>;
    };
    update(row: Record<string, unknown>): { eq(col: string, val: string): PromiseLike<{ error: { message: string } | null }> };
  };
};

const seatDb = (db: Db): SeatBillingDb => db as unknown as SeatBillingDb;

/** Lo stesso codice `23505` di free-org-limit.ts: un secondo addebito per lo stesso account+mese trova la riga già lì. */
const ALREADY_CHARGED_CODE = '23505';

export type ChargeOutcome = 'charged' | 'already_charged' | 'paused_insufficient_balance';

/**
 * Il canone mensile di UN account collegato — chiamato al momento del collegamento (primo mese,
 * intero: niente pro-rata, un numero che l'utente legge senza fare i conti) e ogni mese dopo, da
 * un cron. Idempotente per account+mese: l'indice unico parziale su `credit_ledger`
 * (social_account_id, date_trunc('month', created_at)) where source = 'social_seat' fa il resto
 * — una race fra due tick non addebita due volte.
 *
 * Senza saldo sufficiente l'account passa a `paused`: mai tenuto attivo gratis in silenzio
 * ("non ci rimettiamo MAI", CLAUDE.md) — un account pausato non pubblica, con un motivo visibile.
 */
export async function chargeAccountSeat(
  db: Db,
  input: { accountId: string; orgId: string }
): Promise<ChargeOutcome> {
  const client = seatDb(db);
  const { data: balance } = await client.rpc('org_credit_balance', { _org_id: input.orgId });

  if ((balance ?? 0) < ACCOUNT_SEAT_CREDITS) {
    const { error } = await client
      .from('social_accounts')
      .update({ status: 'paused', last_error: 'Not enough credits for this month\'s account fee' })
      .eq('id', input.accountId);
    if (error) throw error;
    return 'paused_insufficient_balance';
  }

  const { error } = await client.from('credit_ledger').insert({
    org_id: input.orgId,
    kind: 'debit',
    source: 'social_seat',
    amount: ACCOUNT_SEAT_CREDITS,
    social_account_id: input.accountId,
    note: 'Monthly connected-account fee'
  });

  if (error) {
    if (error.code === ALREADY_CHARGED_CODE) return 'already_charged';
    throw error;
  }

  return 'charged';
}

export type RenewSummary = { charged: number; paused: number; alreadyCharged: number };

/**
 * Il rinnovo mensile, chiamato dal tick esistente (`canvas/runs/tick`, ogni minuto — l'idempotenza
 * di `chargeAccountSeat` rende innocuo chiamarlo più volte nello stesso mese) invece di un cron a
 * sé: un account `active` senza addebito questo mese ne riceve uno, uno senza saldo passa
 * `paused`. Legge SOLO account `active` — uno già `paused` non viene ricontrollato da questo
 * passaggio: torna attivo quando l'org compra crediti (fuori da questa funzione).
 */
export async function renewAccountSeats(db: Db): Promise<RenewSummary> {
  const client = seatDb(db);
  const { data: accounts, error } = await client.from('social_accounts').select('id, org_id').eq('status', 'active');
  if (error) throw error;

  const summary: RenewSummary = { charged: 0, paused: 0, alreadyCharged: 0 };
  for (const account of accounts ?? []) {
    const outcome = await chargeAccountSeat(db, { accountId: account.id, orgId: account.org_id });
    if (outcome === 'charged') summary.charged += 1;
    else if (outcome === 'paused_insufficient_balance') summary.paused += 1;
    else summary.alreadyCharged += 1;
  }
  return summary;
}
