-- SUPERSEDED da 20260924_stripe_sync_grants.sql, che ridefinisce la stessa funzione (ancora
-- placeholder) insieme ai trigger che leggono lo schema `stripe` vero — quello creato
-- dall'integrazione Supabase Stripe Sync Engine, non da un FDW inventato in questo repo (vedi il
-- commento in cima a quel file). Questo file resta per la storia; non applicarlo da solo.
--
-- `credits_from_price_id` esisteva già come placeholder in 20260922_org_billing.sql (sempre
-- null: nessun price id era ancora stato creato in Stripe). Questa migrazione la sostituisce con
-- la mappa vera, gradino per gradino — la controparte SQL di
-- `SUBSCRIPTION_PRICE_ID_ENV`/`subscriptionPriceIdFor` in src/lib/server/stripe.ts, che legge lo
-- STESSO price id da una variabile d'ambiente lato applicazione. Le due liste vanno aggiornate
-- insieme: un gradino con un env var valorizzato ma assente da questo CASE non riceve mai il
-- grant che `grant_credits_from_stripe_subscription` scrive quando l'abbonamento rinnova.
--
-- Nessun price id Stripe esiste ancora per nessun gradino: questa migrazione resta un
-- PLACEHOLDER (equivalente a quello di 20260922_org_billing.sql) finché i sette prezzi non sono
-- creati nel dashboard Stripe. Da riscrivere allora, non solo applicare — aggiungere una riga WHEN
-- per ogni price id reale, sullo stesso schema dei commenti sotto.

begin;

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

commit;
