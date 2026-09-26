-- I trigger di grant di 20260922_org_billing.sql (sezioni 7/8) assumevano uno schema `stripe`
-- creato da un FDW inventato da questa migrazione stessa (sezione 2 di quel file): sul progetto
-- vero lo schema `stripe` non esiste affatto (verificato via information_schema, 2026-09-24),
-- e nessuna delle due tabelle e' mai stata creata da NOI. La decisione presa: l'utente installa
-- la Supabase Stripe Sync Engine ufficiale (github.com/stripe/sync-engine, branch `main`,
-- pacchetto npm `stripe-sync-engine`, quello che il progetto Supabase raccomanda) — e' LEI a
-- possedere lo schema `stripe`, con le sue migration, non questo repo. Questa migrazione crea
-- solo i trigger che reagiscono a quello schema, verificato colonna per colonna contro le
-- migration reali del pacchetto (packages/sync-engine/src/database/migrations su GitHub,
-- versione pubblicata v0.48.5):
--
--   stripe.checkout_sessions: id, customer, mode, status, payment_status, amount_total,
--     currency, metadata (jsonb), subscription — tutti scritti verbatim dall'oggetto Stripe
--     grezzo (packages/sync-engine/src/schemas/checkout_sessions.ts elenca le stesse property
--     copiate 1:1 dal payload Stripe, nessuna rinominata). Coincide con quanto
--     20260922_org_billing.sql assumeva per checkout_sessions: nessuna riscrittura li' serviva.
--
--   stripe.subscriptions: id, customer (NON customer_id — verificato,
--     packages/sync-engine/src/schemas/subscription.ts), status, items (jsonb, la lista Stripe
--     grezza: {data: [{price: {id: ...}, ...}], ...} — il prezzo sta in items->'data'->0->'price'
--     ->>'id', non in una colonna price_id separata), metadata, current_period_start/end
--     (integer/epoch, A LIVELLO DI SUBSCRIPTION in questo schema — Stripe li ha spostati sugli
--     item nella sua API piu' recente, e la migration 0032 del pacchetto aggiunge le stesse due
--     colonne a stripe.subscription_items per quello, ma la colonna a livello di subscription
--     resta e la sync engine la popola comunque). Anche qui coincide con quanto
--     20260922_org_billing.sql assumeva: nessuna riscrittura serviva neppure li'.
--
-- La vera divergenza non era nei NOMI delle colonne ma nel fatto che lo schema non esiste
-- finche' l'integrazione non e' installata — per questo billing_grants_ready() (migrazione
-- separata) e' il gate che il codice applicativo legge, e questa migrazione fallisce rumorosamente
-- se applicata prima dell'installazione, invece di creare trigger su tabelle inesistenti.
--
-- credits_from_price_id: 20260924_credits_from_price_id.sql la sostituiva gia' come placeholder
-- equivalente a quello di 20260922_org_billing.sql (nessun price id reale, sempre null). Quel
-- file resta SUPERSEDED da questa migrazione, che la ridefinisce identica (ancora placeholder,
-- nessun price id creato in Stripe): non va cancellato senza dirlo esplicitamente all'utente,
-- resta come storia, ma la definizione vivente della funzione e' quella scritta qui sotto.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'stripe' and table_name = 'checkout_sessions'
  ) then
    raise exception 'install Stripe Sync first: schema stripe.checkout_sessions not found. '
      'Install the Supabase Stripe Sync Engine (github.com/stripe/sync-engine) before applying this migration.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'stripe' and table_name = 'subscriptions'
  ) then
    raise exception 'install Stripe Sync first: schema stripe.subscriptions not found. '
      'Install the Supabase Stripe Sync Engine (github.com/stripe/sync-engine) before applying this migration.';
  end if;
end;
$$;

-- ── Prezzo Stripe → crediti abbonamento. Ridefinisce (non duplica) la funzione di ──────
-- 20260924_credits_from_price_id.sql, che resta nel repo come storia ma e' superseded da questa.
create or replace function public.credits_from_price_id(price_id text) returns integer
  language sql immutable as $$
  select case price_id
    -- when 'price_...' then 500    -- $5/mo   (STRIPE_PRICE_ID_SUBSCRIPTION_5)
    -- when 'price_...' then 1500   -- $15/mo  (STRIPE_PRICE_ID_SUBSCRIPTION_15)
    -- when 'price_...' then 3000   -- $30/mo  (STRIPE_PRICE_ID_SUBSCRIPTION_30)
    -- when 'price_...' then 5000   -- $50/mo  (STRIPE_PRICE_ID_SUBSCRIPTION_50)
    -- when 'price_...' then 11200  -- $100/mo (STRIPE_PRICE_ID_SUBSCRIPTION_100)
    -- when 'price_...' then 24000  -- $200/mo (STRIPE_PRICE_ID_SUBSCRIPTION_200)
    -- when 'price_...' then 52000  -- $400/mo (STRIPE_PRICE_ID_SUBSCRIPTION_400)
    else null
  end;
$$;

-- ── Abbonamento: reagisce a stripe.subscriptions — scrive un grant CHE SCADE ────────────
-- stripe_event_id include il period_start corrente: un rinnovo cambia il period, quindi ogni
-- rinnovo genera un evento nuovo e un doppio-sync dello STESSO periodo collide sull'unique del
-- ledger (credit_ledger.stripe_event_id, creata in 20260922_org_billing.sql sezione 4).
create or replace function public.grant_credits_from_stripe_subscription() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  _price_id text;
  _credits integer;
  _org_id uuid;
  _period_start integer;
  _period_end integer;
  _event_id text;
begin
  if NEW.status not in ('active','trialing') then
    return NEW;
  end if;

  select o.id into _org_id from public.orgs o where o.stripe_customer_id = NEW.customer;
  if _org_id is null then return NEW; end if;

  update public.orgs set stripe_subscription_id = NEW.id where id = _org_id;

  _price_id := NEW.items->'data'->0->'price'->>'id';
  _credits := coalesce(public.credits_from_price_id(_price_id), (NEW.metadata->>'credits')::integer);
  if _credits is null then return NEW; end if;

  _period_start := coalesce((NEW.items->'data'->0->>'current_period_start')::integer, NEW.current_period_start, NEW.billing_cycle_anchor);
  _period_end := coalesce((NEW.items->'data'->0->>'current_period_end')::integer, NEW.current_period_end);
  _event_id := 'sub:' || NEW.id || ':' || coalesce(_period_start::text, 'initial');

  insert into public.credit_ledger (org_id, kind, source, amount, stripe_event_id, expires_at)
  values (
    _org_id, 'grant', 'subscription_renewal', _credits, _event_id,
    case when _period_end is not null then to_timestamp(_period_end) else null end
  )
  on conflict (stripe_event_id) do nothing;

  return NEW;
end; $$;

drop trigger if exists trg_grant_from_subscription on stripe.subscriptions;
create trigger trg_grant_from_subscription
  after insert or update on stripe.subscriptions
  for each row execute function public.grant_credits_from_stripe_subscription();

revoke execute on function public.grant_credits_from_stripe_subscription() from public, anon, authenticated;

-- ── Acquisto una tantum: reagisce a stripe.checkout_sessions — grant PERMANENTE ─────────
-- stripe_event_id = 'checkout:' || session.id: una Checkout Session si completa una volta sola
-- (status passa a 'complete' e resta li'), quindi l'id della sessione e' la chiave naturale
-- contro il doppio-apply — Stripe consegna gli eventi ALMENO una volta, e la sync engine puo'
-- risincronizzare la stessa riga piu' di una volta.
create or replace function public.grant_credits_from_checkout_session() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  _org_id uuid;
  _credits integer;
begin
  if NEW.mode <> 'payment' or NEW.status <> 'complete' or NEW.payment_status <> 'paid' then
    return NEW;
  end if;

  _org_id := (NEW.metadata->>'org_id')::uuid;
  _credits := (NEW.metadata->>'credits')::integer;
  if _org_id is null or _credits is null then return NEW; end if;

  insert into public.credit_ledger (org_id, kind, source, amount, stripe_event_id, stripe_checkout_id, expires_at)
  values (_org_id, 'grant', 'one_time_purchase', _credits, 'checkout:' || NEW.id, NEW.id, null)
  on conflict (stripe_event_id) do nothing;

  return NEW;
end; $$;

drop trigger if exists trg_grant_from_checkout on stripe.checkout_sessions;
create trigger trg_grant_from_checkout
  after insert or update on stripe.checkout_sessions
  for each row execute function public.grant_credits_from_checkout_session();

revoke execute on function public.grant_credits_from_checkout_session() from public, anon, authenticated;

commit;
