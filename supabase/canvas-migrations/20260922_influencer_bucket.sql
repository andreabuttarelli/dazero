-- Il bucket delle viste di un influencer — due forme di percorso nello stesso bucket, non due
-- bucket, perché la sola differenza è CHI legge, non la natura del file.
--
--   catalogue/<influencerId>/...   il catalogo globale (`influencers.org_id is null`): ogni
--                                  utente autenticato legge, nessuno scrive — lo script di
--                                  import scrive con la service-role key, che bypassa la RLS.
--   <orgId>/<influencerId>/...     un influencer proprio di un'org: legge e scrive solo lei,
--                                  stessa forma di `canvas-assets` (org come primo segmento).
--
-- La policy di lettura per `catalogue/...` è un confronto di STRINGA sul primo segmento
-- (`= 'catalogue'`), non un `::uuid in (select auth_org_ids())` come ogni altro bucket qui —
-- è la vera deviazione di questa migration, perché "catalogo" non è un id di org, è una parola.
-- La policy per l'altra forma resta identica a `canvas-assets`.

begin;

insert into storage.buckets (id, name, public) values ('influencers', 'influencers', false)
  on conflict (id) do nothing;

drop policy if exists "influencers read catalogue" on storage.objects;
drop policy if exists "influencers read own org" on storage.objects;
drop policy if exists "influencers write own org" on storage.objects;
drop policy if exists "influencers delete own org" on storage.objects;

create policy "influencers read catalogue" on storage.objects for select to authenticated
  using (bucket_id = 'influencers' and (storage.foldername(name))[1] = 'catalogue');

create policy "influencers read own org" on storage.objects for select to authenticated
  using (
    bucket_id = 'influencers'
    and (storage.foldername(name))[1] <> 'catalogue'
    and (storage.foldername(name))[1]::uuid in (select public.auth_org_ids())
  );

create policy "influencers write own org" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'influencers'
    and (storage.foldername(name))[1] <> 'catalogue'
    and (storage.foldername(name))[1]::uuid in (select public.auth_org_ids())
  );

create policy "influencers delete own org" on storage.objects for delete to authenticated
  using (
    bucket_id = 'influencers'
    and (storage.foldername(name))[1] <> 'catalogue'
    and (storage.foldername(name))[1]::uuid in (select public.auth_org_ids())
  );

commit;
