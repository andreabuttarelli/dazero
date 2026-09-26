-- Zernio è l'unica fonte di verità per la programmazione e la pubblicazione (decisione utente,
-- 2026-09-22: "possiamo usare come unica fonte di verità zernio? Invece di duplicare i dati senza
-- la certezza che siano congrui e validi"). `scheduled_posts` (0 righe oggi, nessun writer nel
-- codice) copiava `scheduled_at`/`status`/`caption`/`media` — tutto quello che Zernio già tiene, e
-- che divergerebbe in silenzio: uno stato aggiornato su Zernio (pausato, fallito, ripubblicato) non
-- avrebbe alcun modo di tornare indietro su una riga nostra senza un secondo worker di
-- riconciliazione, che è esattamente la duplicazione da evitare.
--
-- Quello che RESTA nostro è il puntatore, non lo stato: `posts.zernio_post_ids`, una mappa
-- `social_accounts.id -> id del post lato Zernio`. Zernio pubblica un post per (account,
-- piattaforma) — `SocialPublisher.publish()` prende un `accountId` solo e ne torna un `postId`
-- solo (src/lib/server/publishing/port.ts) — quindi un post dazero mandato a più account porta più
-- id Zernio, e la chiave giusta è l'account, non la piattaforma: due account sulla stessa
-- piattaforma altrimenti collidono sulla stessa chiave.
--
-- `ad_creatives.scheduled_post_id` perde il suo bersaglio con la tabella: il boost di un organico
-- già in consegna torna a puntare `post_id`, che già esiste ed è nullable — la distinzione
-- dark-post/boost-di-un-organico non ha più bisogno di una seconda colonna quando non c'è più una
-- riga "consegna" separata dal post.

begin;

alter table public.ad_creatives drop constraint if exists ad_creatives_scheduled_post_id_fkey;
alter table public.ad_creatives drop column if exists scheduled_post_id;

drop table if exists public.scheduled_posts;

alter table public.posts
  add column if not exists zernio_post_ids jsonb not null default '{}'::jsonb;

comment on column public.posts.zernio_post_ids is
  'Puntatore, non stato: { "<social_accounts.id>": "<zernio post id>" }. Programmazione, stato di '
  'consegna e riprogrammazione si leggono da Zernio (GET /posts/:id) con questi id, mai copiati '
  'in una colonna di stato locale.';

commit;
