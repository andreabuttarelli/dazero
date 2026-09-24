-- Un pagamento che arriva in Stripe e non atterra mai su credit_ledger e' peggio di nessun
-- pagamento: il cliente ha pagato e non ha ricevuto nulla. Finche' la Supabase Stripe Sync
-- Engine non e' installata (schema `stripe` inesistente sul DB live, verificato) e finche'
-- `20260924_stripe_sync_grants.sql` non e' applicata (nessun trigger di grant), ogni endpoint
-- di acquisto deve rifiutarsi di vendere — questa funzione e' il gate unico che tutti loro
-- leggono, mai una condizione duplicata in ciascuno.
--
-- Fail-closed per costruzione, non per convenzione applicativa: risponde false finche' non
-- trova ENTRAMBE le condizioni, e il codice server (src/lib/server/billing-readiness.ts) tratta
-- anche un errore RPC — funzione ancora inesistente, prima che questa migrazione sia applicata —
-- come "non pronto", mai come "pronto".

begin;

create or replace function public.billing_grants_ready() returns boolean
  language plpgsql stable security definer set search_path = '' as $$
declare
  _checkout_sessions_exists boolean;
  _grant_trigger_exists boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'stripe' and table_name = 'checkout_sessions'
  ) into _checkout_sessions_exists;

  if not _checkout_sessions_exists then
    return false;
  end if;

  select exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'stripe'
      and c.relname = 'checkout_sessions'
      and not t.tgisinternal
  ) into _grant_trigger_exists;

  return _grant_trigger_exists;
end;
$$;

revoke execute on function public.billing_grants_ready() from public, anon;
grant execute on function public.billing_grants_ready() to authenticated, service_role;

commit;
