begin;

alter table public.nodes replica identity full;
alter table public.nodes_connections replica identity full;

do $$
declare
  published_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach published_table in array array['nodes', 'nodes_connections', 'canvases'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = published_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', published_table);
    end if;
  end loop;
end;
$$;

-- Un canale `private: true` si autorizza interrogando `realtime.messages` e poi annullando la
-- transazione: senza policy, RLS nega e il subscribe risponde Unauthorized sul topic. Il filtro
-- per `extension` è per-feature: qui decide CHI sta nella tela, e un membro le usa tutte
-- (presence, broadcast, postgres_changes). Un filtro `extension = 'presence'` lascerebbe fuori
-- l'authorization del subscribe stesso, che non arriva con quell'estensione.

drop policy if exists "canvas members receive presence" on realtime.messages;
drop policy if exists "canvas members publish presence" on realtime.messages;
drop policy if exists "canvas members read realtime" on realtime.messages;
drop policy if exists "canvas members write realtime" on realtime.messages;

create policy "canvas members read realtime"
on realtime.messages for select to authenticated
using (
  exists (
    select 1 from public.canvases
    where (select realtime.topic()) = 'canvas:' || canvases.id::text
      and canvases.org_id in (select public.auth_org_ids())
  )
);

create policy "canvas members write realtime"
on realtime.messages for insert to authenticated
with check (
  exists (
    select 1 from public.canvases
    where (select realtime.topic()) = 'canvas:' || canvases.id::text
      and canvases.org_id in (select public.auth_org_ids())
  )
);

commit;
