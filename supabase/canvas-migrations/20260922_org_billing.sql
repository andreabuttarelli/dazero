-- I crediti sono a CONSUMO, non a livelli, con un margine minimo del 35% che non si attraversa MAI
-- (NEW_DATABASE_STRUCTURE.md, sezione "Fatturazione") — abbonamento e acquisto una tantum sugli
-- stessi punti di prezzo, a due cambi diversi (100:1 / 70:1), e ogni chiamata AI fatturata con un
-- markup del 100% sul costo provider (200 crediti ogni $1 di `ai_calls.cost_usd`). Non c'è più un
-- `plan` da leggere: c'è un SALDO, ed è per questo che la tabella centrale è `credit_ledger`
-- (grant/debit), non una colonna testuale su `orgs`.
--
-- I crediti da abbonamento SCADONO a fine periodo, quelli da acquisto una tantum MAI: questo rende
-- l'ORDINE di spesa un fatto di soldi (le scadenti vanno consumate prima), non solo un saldo. Il
-- saldo resta una somma cieca all'ordine (org_credit_balance) — quello che serve l'ordine è "cosa
-- sta per scadere invaso" (org_credits_at_risk), separato dal gate di spesa.
--
-- La scala di prezzo e il markup NON sono qui: vivono in src/lib/server/credit-ladder.ts, pinnati
-- da un test che cammina ogni gradino e fallisce sotto il floor — questa migrazione legge solo
-- `stripe_price_id → credits` (abbonamento) o `metadata.credits` (acquisto), qualunque numero il
-- codice le passi.

begin;

-- ── 1. Le colonne Stripe sull'org — niente `plan`, solo gli identificativi ────────
alter table public.orgs
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists orgs_stripe_customer_idx on public.orgs (stripe_customer_id);

-- ── 2. Lo schema Stripe: tabelle esterne sincronizzate dal Supabase Stripe Wrapper ────
-- Non sono tabelle nostre: Stripe le scrive da fuori (FDW). Sul self-host (BILLING_PROVIDER=open)
-- lo schema si crea comunque, vuoto: lo stesso SQL compila per tutti. Stesso trucco di
-- 0007_stripe_brand_sync.sql sul vecchio schema, esteso con checkout_sessions per l'acquisto una
-- tantum (il Wrapper espone entrambi gli oggetti dallo stesso server FDW).
create schema if not exists stripe;

create table if not exists stripe.subscriptions (
  id text primary key,
  customer text,
  status text,
  metadata jsonb,
  items jsonb,
  plan jsonb,
  -- epoch bigint, non timestamptz: i trigger sotto li coforzano con to_timestamp().
  current_period_start bigint,
  current_period_end bigint,
  billing_cycle_anchor bigint
);

create table if not exists stripe.checkout_sessions (
  id text primary key,
  customer text,
  mode text,              -- 'payment' | 'subscription' | 'setup'
  status text,             -- 'open' | 'complete' | 'expired'
  payment_status text,     -- 'paid' | 'unpaid' | 'no_payment_required'
  amount_total bigint,
  currency text,
  metadata jsonb
);

-- ── 3. Prezzo Stripe → crediti abbonamento. Allineato a CREDIT_LADDER in ────────────
-- src/lib/server/credit-ladder.ts a mano — non generato da codice, equivalente SQL della stessa
-- mappa (pattern di 0075_plan_from_price.sql, valore diverso: crediti invece di un tier).
create or replace function public.credits_from_price_id(price_id text) returns integer
  language sql immutable as $$
  select case price_id
    -- PLACEHOLDER: i price id reali vanno collegati quando i sette gradini sono creati in Stripe
    -- ($5/$15/$30/$50/$100/$200/$400, vedi CREDIT_LADDER).
    else null
  end;
$$;

-- ── 4. credit_ledger: grant e debiti come righe, saldo = somma ─────────────────────────
-- Sostituisce sia `orgs.plan` sia il vecchio `credit_grants`: un abbonamento che rinnova, un
-- pacchetto comprato una volta, un bonus promo, un override enterprise e il consumo di una
-- chiamata AI sono tutti una riga qui, con un `source` diverso — mai una colonna diversa, mai una
-- tabella diversa.
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (kind in ('grant','debit')),
  source text not null
    check (source in ('subscription_renewal','one_time_purchase','promo','manual','refund','ai_usage')),
  amount integer not null check (amount > 0),
  note text,
  created_by uuid references public.profiles(id) on delete set null,

  stripe_event_id text,
  stripe_checkout_id text,
  stripe_invoice_id text,
  ai_call_id uuid references public.ai_calls(id) on delete set null,

  -- null = non scade mai (il default per un acquisto una tantum). Valorizzato = scade (rinnovo
  -- abbonamento: fine del periodo a cui appartiene; bonus promo a termine).
  expires_at timestamptz,

  created_at timestamptz not null default now(),

  -- LA riga che rende un doppio-apply innocuo: uno stesso evento Stripe (un rinnovo, un acquisto)
  -- non può inserire due grant. Null-safe: due righe con stripe_event_id null (es. un debito
  -- ai_usage o un grant 'manual') non collidono fra loro, l'unique su Postgres ignora i null.
  unique (stripe_event_id)
);

create index if not exists credit_ledger_org_idx on public.credit_ledger (org_id);
create index if not exists credit_ledger_org_active_idx
  on public.credit_ledger (org_id) where expires_at is null or expires_at > now();
create index if not exists credit_ledger_ai_call_idx on public.credit_ledger (ai_call_id);

alter table public.credit_ledger enable row level security;

drop policy if exists org_isolation on public.credit_ledger;
create policy org_isolation on public.credit_ledger
  for select using (org_id in (select public.auth_org_ids()));
-- Scritture: solo service-role (nessuna policy insert/update/delete per authenticated) — un
-- membro, incluso l'owner, non può regalarsi crediti da sé, né cancellare un debito.

-- ── 5. Il saldo: somma di tutte le righe non scadute, cieca all'ordine di consumo ────
-- Una query, nessun ordine da calcolare per rispondere "quanto ho": l'ordine (le scadenti prima)
-- conta solo per "cosa sto per perdere" (org_credits_at_risk sotto), non per il totale.
create or replace function public.org_credit_balance(_org_id uuid) returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'grant' then amount else -amount end), 0)::integer
  from public.credit_ledger
  where org_id = _org_id
    and (expires_at is null or expires_at > now());
$$;

revoke execute on function public.org_credit_balance(uuid) from public, anon;
grant execute on function public.org_credit_balance(uuid) to authenticated, service_role;

-- ── 6. Cosa sta per scadere invaso: FIFO sui grant che scadono prima ────────────────
-- Alimenta l'email di avviso, non il gate di spesa (che legge solo org_credit_balance). L'ordine
-- di consumo (le scadenti prima) è implicito nel modo in cui questa vista calcola quanto è a
-- rischio, non in come si scrivono i debiti (un debito solo per chiamata, cieco all'ordine).
--
-- NOTA (2026-09-24): la vista live sul DB non è questa. È la versione precedente, più semplice —
-- `expiring_credits`/`next_expiry`, senza FIFO né sottrazione della spesa (verificato via
-- pg_get_viewdef) — mai sostituita da un'applicazione di questo file. `+page.server.ts` legge
-- già quella, non questa: `expiring_credits` è un tetto per eccesso (non sottrae la spesa, quindi
-- non sottostima mai il rischio), e alimenta solo una riga di avviso, non il gate di spesa. Non
-- vale il costo di applicare la vista FIFO-netta sotto solo per quella riga: se un giorno il
-- gate di spesa dovesse leggere "quanto è già a rischio" invece che solo il saldo, riconsiderare.
create or replace view public.org_credits_at_risk as
with grants as (
  select org_id, id, amount, expires_at,
         sum(amount) over (partition by org_id order by expires_at nulls last, created_at) as running_total
  from public.credit_ledger
  where kind = 'grant' and (expires_at is null or expires_at > now())
),
spent as (
  select org_id, coalesce(sum(amount), 0) as total_spent
  from public.credit_ledger where kind = 'debit' group by org_id
)
select g.org_id, g.expires_at,
       greatest(0, least(g.amount, g.running_total - coalesce(s.total_spent, 0))) as at_risk
from grants g
left join spent s on s.org_id = g.org_id
where g.expires_at is not null and g.running_total > coalesce(s.total_spent, 0);

-- ── 7. Abbonamento: reagisce a stripe.subscriptions — scrive un grant CHE SCADE ────
-- Nessun endpoint applicativo riceve eventi Stripe in questo repo: il FDW scrive
-- stripe.subscriptions dal vivo, questo trigger reagisce a ogni INSERT/UPDATE. stripe_event_id
-- include il period_start corrente: un rinnovo cambia il period, quindi ogni rinnovo genera un
-- evento nuovo e un doppio-sync dello STESSO periodo collide sull'unique del ledger.
create or replace function public.grant_credits_from_stripe_subscription() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  _price_id text;
  _credits integer;
  _org_id uuid;
  _period_start bigint;
  _period_end bigint;
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

  _period_start := coalesce((NEW.items->'data'->0->>'current_period_start')::bigint, NEW.current_period_start, NEW.billing_cycle_anchor);
  _period_end := coalesce((NEW.items->'data'->0->>'current_period_end')::bigint, NEW.current_period_end);
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

-- ── 8. Acquisto una tantum: reagisce a stripe.checkout_sessions — grant PERMANENTE ────
-- I crediti vengono da NEW.metadata->>'credits', scritto dal nostro codice al momento della
-- creazione della sessione (già calcolato al cambio 70:1 sulla scala di credit-ladder.ts) — non da
-- una seconda mappa prezzo→crediti in SQL: una sola fonte di verità sul prezzo di un pacchetto.
--
-- stripe_event_id = 'checkout:' || session.id: una Checkout Session si completa una volta sola
-- (status passa a 'complete' e resta lì), quindi l'id della sessione è la chiave naturale contro
-- il doppio-apply — Stripe consegna gli eventi ALMENO una volta, e il FDW può risincronizzare la
-- stessa riga più di una volta: senza questo vincolo un pacchetto pagato una volta raddoppierebbe
-- i crediti a ogni resync.
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

commit;
