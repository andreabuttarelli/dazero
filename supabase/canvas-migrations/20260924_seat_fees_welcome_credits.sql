-- Due addebiti nuovi passano per credit_ledger, e nessuno dei due è 'ai_usage' — il canone
-- mensile di un account social collegato non è una chiamata AI, e il benvenuto non è una spesa.
-- Allarga il CHECK di 20260922_org_billing.sql invece di aprirne uno parallelo: una sola tabella
-- di casi ammessi, mai due liste che possono disallinearsi.
--
-- 'social_seat': debito, canone mensile per account collegato (ACCOUNT_SEAT_CREDITS,
-- credit-ladder.ts). Idempotente per account+mese: vedi social_account_charges sotto.
-- 'welcome': già coperto da 'promo' — non serve un valore nuovo, solo l'idempotenza sull'org.

begin;

alter table public.credit_ledger drop constraint if exists credit_ledger_source_check;
alter table public.credit_ledger
  add constraint credit_ledger_source_check
  check (source in (
    'subscription_renewal', 'one_time_purchase', 'promo', 'manual', 'refund', 'ai_usage',
    'social_seat'
  ));

-- ── Canone account: chi porta l'idempotenza social_account_id + mese ──────────────────
-- Un debito 'social_seat' senza questa colonna non saprebbe MAI se un account è già stato
-- addebitato per il mese in corso — la stessa riga che account-billing.ts scrive ogni tick.
alter table public.credit_ledger
  add column if not exists social_account_id uuid references public.social_accounts(id) on delete set null;

create unique index if not exists credit_ledger_social_seat_month_idx
  on public.credit_ledger (social_account_id, (date_trunc('month', created_at at time zone 'UTC')))
  where source = 'social_seat' and social_account_id is not null;

-- ── Il limite delle org gratuite, applicato anche a chi scrive orgs_members da fuori ────
-- L'applicazione vera sta in tenancy/bootstrap.ts (un solo posto, come richiesto): questo
-- trigger è la seconda barriera, per chi scrivesse orgs_members passando dalla Data API con il
-- proprio JWT invece che dal codice. "Gratuita" = l'org non ha MAI incassato un pagamento vero
-- (nessuna riga credit_ledger con source in ('subscription_renewal','one_time_purchase')).
create or replace function public.enforce_free_org_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  _joining_is_free boolean;
  _free_count integer;
begin
  select not exists (
    select 1 from public.credit_ledger cl
    where cl.org_id = NEW.org_id
      and cl.source in ('subscription_renewal', 'one_time_purchase')
  ) into _joining_is_free;

  -- Un'org che ha già pagato non è mai bloccata da questo limite, a prescindere da quante altre
  -- org gratuite l'utente porti già: il limite conta SOLO le org gratuite.
  if not _joining_is_free then
    return NEW;
  end if;

  select count(*) into _free_count
  from public.orgs_members m
  where m.user_id = NEW.user_id
    and not exists (
      select 1 from public.credit_ledger cl
      where cl.org_id = m.org_id
        and cl.source in ('subscription_renewal', 'one_time_purchase')
    );

  if _free_count >= 2 then
    raise exception 'free_org_limit_reached' using errcode = 'P0001';
  end if;

  return NEW;
end; $$;

drop trigger if exists trg_enforce_free_org_limit on public.orgs_members;
create trigger trg_enforce_free_org_limit
  before insert on public.orgs_members
  for each row execute function public.enforce_free_org_limit();

commit;
