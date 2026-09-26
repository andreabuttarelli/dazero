begin;

revoke execute on function public.auth_org_ids() from public, anon;
grant execute on function public.auth_org_ids() to authenticated;

commit;
