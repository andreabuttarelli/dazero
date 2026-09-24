-- The balance guard `_org_id in (select auth_org_ids())` stops a member from reading another
-- org's balance, but auth_org_ids() is empty without a user JWT, so every server-side read
-- (the credit gate uses the service-role client) returned 0 and refused every generation.
-- The service role is trusted and keeps full read; users keep the membership guard.
begin;

create or replace function public.org_credit_balance(_org_id uuid) returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'grant' then amount else -amount end), 0)::integer
  from public.credit_ledger
  where org_id = _org_id
    and (auth.role() = 'service_role' or _org_id in (select auth_org_ids()))
    and (kind = 'debit' or expires_at is null or expires_at > now());
$$;

revoke execute on function public.org_credit_balance(uuid) from public, anon;
grant execute on function public.org_credit_balance(uuid) to authenticated, service_role;

commit;
