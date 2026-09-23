-- `media` — l'unico bucket PUBBLICO, per il materiale che deve restare leggibile da un URL nudo
-- oltre la sessione: l'avatar di un profilo (`settings-actions.ts`), il logo importato da un sito
-- (`studio-actions.ts`) e lo swatch di un colore trascinato sulla tela (`brand-colour-asset.ts`).
-- Quest'ultimo lo dice il suo stesso chiamante: `findOrCreateColourAsset` scrive `assets.url` come
-- URL pubblico e lo consegna al browser per un `dragstart` sincrono — un URL firmato che scade
-- romperebbe un colore trascinato ore dopo averlo aperto, o un nodo riaperto il giorno dopo.
--
-- TUTTO IL RESTO — video, immagini e audio generati (`video.ts`, `media-generate.images.ts`,
-- `gemini-audio.ts`, `brand-media.ts`) — NON viene qui: quella è produzione AI riusabile del
-- brand, esattamente ciò che `brand-knowledge` già serve con `signKnowledgePaths`
-- (`handOverImage`/`depositImage` sulla stessa tela ci passano già). Due bucket diversi perché sono
-- due doveri diversi — pubblico e durevole contro privato e firmato — non due bucket per lo stesso
-- materiale.
--
-- `storage.buckets` sul progetto nuovo non ha mai avuto `media`: gli scrittori che lo chiamavano
-- fallivano ogni upload («Bucket not found»), lo stesso difetto che
-- `20260922_canvas_asset_buckets.sql` documenta per `brand-knowledge`/`canvas-assets`.
--
-- LETTURA pubblica, nessuna riga di RLS: `public = true` la governa da sé, com'è per ogni bucket
-- pubblico di Storage. SCRITTURA e CANCELLAZIONE variano per FORMA di percorso, non per bucket —
-- stessa deviazione già vista in `influencers`:
--
--   {userId}/...            avatar (`settings-actions.ts`), logo importato da URL
--                            (`studio-actions.ts`), riferimento video di chat (`upload-url`):
--                            un utente, mai un'org intera.
--   {brandId}/logo-...      upload diretto del logo dalle impostazioni del brand
--                            (`settings/brand/+page.server.ts`): qui il proprietario del percorso
--                            è il brand, quindi la policy sale a `brands.org_id`, non a un utente
--                            — `auth_brand_ids()` non esiste più su questo schema (il tenant è
--                            l'org, non il brand: vedi lo schema in CLAUDE.md).
--   colours/{orgId}/{hex}   `colourSwatchPath`: idempotente per org e colore, quindi il
--                            proprietario del percorso è l'org (`auth_org_ids()`), non chi ha
--                            trascinato — due membri della stessa org che trascinano lo stesso
--                            colore scrivono lo stesso file.

begin;

insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;

drop policy if exists "media insert own" on storage.objects;
drop policy if exists "media delete own" on storage.objects;
drop policy if exists "media insert own brand" on storage.objects;
drop policy if exists "media delete own brand" on storage.objects;
drop policy if exists "media insert own colour" on storage.objects;
drop policy if exists "media delete own colour" on storage.objects;

create policy "media insert own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "media delete own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media insert own brand" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] <> 'colours'
    and (storage.foldername(name))[1]::uuid in (select id from public.brands where org_id in (select public.auth_org_ids()))
  );
create policy "media delete own brand" on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] <> 'colours'
    and (storage.foldername(name))[1]::uuid in (select id from public.brands where org_id in (select public.auth_org_ids()))
  );

create policy "media insert own colour" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'colours'
    and (storage.foldername(name))[2]::uuid in (select public.auth_org_ids())
  );
create policy "media delete own colour" on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'colours'
    and (storage.foldername(name))[2]::uuid in (select public.auth_org_ids())
  );

commit;
