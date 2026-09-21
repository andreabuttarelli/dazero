-- L'inventario dei file, leggibile dal raccoglitore di orfani.
--
-- `storage.objects` esiste in Postgres ma NON è raggiungibile dal client: PostgREST espone solo
-- `public` e `graphql_public`, e `supabase.schema('storage')` risponde PGRST106 su ogni chiamata.
-- Il raccoglitore credeva di leggerlo e falliva sempre, in silenzio dietro un `error` che nessuno
-- aveva ancora provocato — il report di 582 orfani era stato ottenuto con SQL scritto a mano, non
-- da questo codice.
--
-- Una funzione in `public` è il ponte, e resta STRETTA quanto serve: legge, non cancella, e
-- restituisce le tre sole colonne su cui il raccoglitore ragiona. I byte non si toccano da qui —
-- togliere una riga di `storage.objects` lascerebbe il file pagato e irraggiungibile.
--
-- `security definer` perché `storage.objects` non è leggibile da `authenticated`; `search_path`
-- fissato perché una funzione definer senza search_path è un vettore di escalation.
create or replace function public.storage_objects_page(
  p_bucket text,
  p_from bigint,
  p_limit int
)
returns table (name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, o.created_at
  from storage.objects o
  where o.bucket_id = p_bucket
  -- `id` è unico: senza un ordine totale due pagine consecutive possono saltare una riga, e una
  -- riga saltata qui è un file vivo proposto per la cancellazione.
  order by o.id
  offset p_from
  limit p_limit
$$;

revoke all on function public.storage_objects_page(text, bigint, int) from public, anon, authenticated;
grant execute on function public.storage_objects_page(text, bigint, int) to service_role;
