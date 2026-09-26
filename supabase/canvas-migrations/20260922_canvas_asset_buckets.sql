-- I due bucket che il canvas scrive e NESSUNO aveva mai creato sul progetto nuovo.
--
-- Ogni giro immagine falliva con `store_failed`, sempre: il modello rispondeva (40-70s di run
-- reale), ma `storage.buckets` sul progetto nuovo (klnswzhhgrqvbfjzioul) è vuota — zero righe,
-- verificato con una query diretta. `0021_brand_documents.sql` crea `brand-knowledge` sul
-- database VECCHIO; qui non è mai stata riapplicata, e `canvas-assets` non ha mai avuto una
-- migrazione: nasceva a mano nel dashboard (MIGRATION_PLAN.md, fase 2), lo stesso difetto che
-- `20260905140000_storage_tenant_isolation.sql` documenta per `media`.
--
--   `brand-knowledge`  il disegno di un nodo immagine — `source = 'generated'` in `assets.url`,
--                      via `generateImagesWithoutBrand` → `handOverImage`. Percorso
--                      `${userId}/media/...`: senza un brand a fare da confine, il primo
--                      segmento resta lo user, come già per `media` (0004).
--   `canvas-assets`    un file caricato sulla tela — `source = 'upload'`, via `uploadCanvasAsset`.
--                      Percorso `${orgId}/${projectId}/...`: qui il confine è l'org, letta da
--                      `auth_org_ids()` (orgs_members), non lo user che ha caricato.
--
-- `/c/<canvasId>/assets/<id>` sceglie il bucket guardando `source` — vedi il commento lì.

begin;

insert into storage.buckets (id, name, public) values ('brand-knowledge', 'brand-knowledge', false)
  on conflict (id) do nothing;

drop policy if exists "brand-knowledge read own" on storage.objects;
drop policy if exists "brand-knowledge insert own" on storage.objects;
drop policy if exists "brand-knowledge delete own" on storage.objects;

create policy "brand-knowledge read own" on storage.objects for select to authenticated
  using (bucket_id = 'brand-knowledge' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "brand-knowledge insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-knowledge' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "brand-knowledge delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

insert into storage.buckets (id, name, public) values ('canvas-assets', 'canvas-assets', false)
  on conflict (id) do nothing;

drop policy if exists "canvas-assets read own org" on storage.objects;
drop policy if exists "canvas-assets insert own org" on storage.objects;
drop policy if exists "canvas-assets delete own org" on storage.objects;

create policy "canvas-assets read own org" on storage.objects for select to authenticated
  using (bucket_id = 'canvas-assets' and (storage.foldername(name))[1]::uuid in (select public.auth_org_ids()));
create policy "canvas-assets insert own org" on storage.objects for insert to authenticated
  with check (bucket_id = 'canvas-assets' and (storage.foldername(name))[1]::uuid in (select public.auth_org_ids()));
create policy "canvas-assets delete own org" on storage.objects for delete to authenticated
  using (bucket_id = 'canvas-assets' and (storage.foldername(name))[1]::uuid in (select public.auth_org_ids()));

commit;
