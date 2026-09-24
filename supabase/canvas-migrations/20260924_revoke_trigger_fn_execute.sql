-- A trigger function needs no EXECUTE grant to fire; exposed through /rest/v1/rpc it is only
-- attack surface (security advisor 0028/0029).
begin;
revoke execute on function public.enforce_free_org_limit() from public, anon, authenticated;
commit;
