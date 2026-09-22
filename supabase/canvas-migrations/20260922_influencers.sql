-- INFLUENCER: un volto riusabile fra tele diverse, dentro un nodo canvas solo. `influencers`
-- porta l'anagrafica, `influencer_views` le immagini — la stessa separazione di `nodes`/`assets`,
-- perché un volto ha più viste (frontale, profilo, corpo intero) e non una sola.
--
-- `org_id` NULLABLE, e non per svista: `null` è il catalogo GLOBALE, seminato da 54 talent presi
-- dal prodotto precedente (anomalia) — ogni org lo vede, nessuna lo scrive. Un'org che crea un
-- proprio influencer, dall'IA o da foto caricate, ottiene `org_id` valorizzato e lo vede solo lei.
-- È la stessa domanda a cui `NEW_DATABASE_STRUCTURE.md` non aveva ancora risposto (§ influencers,
-- prima di questa migration): non "a cosa serve" ma "chi lo vede" — e la risposta è due platee,
-- non una tabella con `org_id not null` come le altre 26.
--
-- `template_of` è il clone: "usa come modello" copia un influencer (di catalogo o di un'altra org)
-- dentro l'org di chi guarda, con `org_id` valorizzato e le opzioni del builder già pre-compilate
-- — si parte da un volto vicino, non da zero. `builder` è la stessa selezione che
-- `InfluencerBuilder.svelte` mostra: riaprirla su un influencer già creato la ripropone identica.

begin;

create table public.influencers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.orgs(id) on delete cascade,
  template_of  uuid references public.influencers(id) on delete set null,

  name         text not null,
  slug         text not null,
  gender       text,
  age          integer,
  ethnicity    text,
  body_type    text,
  height_band  text,
  summary      text,
  traits       jsonb not null default '{}'::jsonb,

  source       text not null default 'generated'
               check (source in ('catalogue', 'generated', 'upload')),
  builder      jsonb,
  consent      boolean not null default false,

  actor_kind   text not null default 'user' check (actor_kind in ('user', 'agent', 'system')),
  actor_id     uuid references public.profiles(id),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- Un catalogo non porta due righe con lo stesso slug, un'org non porta due suoi influencer con lo
-- stesso slug — ma due org diverse possono chiamare entrambe il proprio "luna". `org_id` dentro
-- l'indice, non fuori: un `unique(slug)` semplice romperebbe la seconda org al primo nome uguale.
-- `coalesce` perché due `null` in `org_id` (due righe di catalogo) sono comunque lo stesso spazio
-- dei nomi — un indice unique su `org_id` nullable tratterebbe ogni `null` come distinto.
create unique index influencers_org_slug_key
  on public.influencers (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
  where deleted_at is null;

create index influencers_org_id_idx on public.influencers (org_id) where deleted_at is null;
create index influencers_template_of_idx on public.influencers (template_of) where template_of is not null;

create table public.influencer_views (
  id             uuid primary key default gen_random_uuid(),
  influencer_id  uuid not null references public.influencers(id) on delete cascade,
  -- Rispecchia `influencers.org_id`, non lo si legge da un join a ogni riga: la RLS di una tabella
  -- guarda la PROPRIA colonna, mai quella del padre attraverso una subquery — la stessa scelta di
  -- `nodes.org_id` accanto a `nodes.canvas_id`, che NEW_DATABASE_STRUCTURE.md già motiva così.
  org_id         uuid references public.orgs(id) on delete cascade,

  view_key       text not null,
  label          text not null,
  storage_path   text not null,
  mime_type      text,
  width          integer,
  height         integer,
  sort_order     integer not null default 0,

  created_at     timestamptz not null default now()
);

create index influencer_views_influencer_id_idx on public.influencer_views (influencer_id, sort_order);
create index influencer_views_org_id_idx on public.influencer_views (org_id);

alter table public.influencers enable row level security;
alter table public.influencer_views enable row level security;

-- LETTURA: il catalogo (`org_id is null`) è per chiunque abbia una sessione — non serve
-- appartenere a un'org per sfogliarlo, solo per crearne uno proprio. Le righe della propria org si
-- aggiungono, non sostituiscono: la stessa `using` di ogni altra tabella più "o è del catalogo".
create policy "influencers read catalogue or own org" on public.influencers
  for select to authenticated
  using (org_id is null or org_id in (select public.auth_org_ids()));

create policy "influencer_views read catalogue or own org" on public.influencer_views
  for select to authenticated
  using (org_id is null or org_id in (select public.auth_org_ids()));

-- SCRITTURA: solo per la propria org, mai per `org_id is null` — il catalogo è seminato dallo
-- script di import con la service-role key (bypassa la RLS per costruzione, vedi
-- `service-role-uses.ts`), non da una policy che lascerebbe chiunque scrivere nel catalogo globale.
create policy "influencers write own org" on public.influencers
  for insert to authenticated
  with check (org_id is not null and org_id in (select public.auth_org_ids()));

create policy "influencers update own org" on public.influencers
  for update to authenticated
  using (org_id is not null and org_id in (select public.auth_org_ids()))
  with check (org_id is not null and org_id in (select public.auth_org_ids()));

create policy "influencers delete own org" on public.influencers
  for delete to authenticated
  using (org_id is not null and org_id in (select public.auth_org_ids()));

create policy "influencer_views write own org" on public.influencer_views
  for insert to authenticated
  with check (org_id is not null and org_id in (select public.auth_org_ids()));

create policy "influencer_views update own org" on public.influencer_views
  for update to authenticated
  using (org_id is not null and org_id in (select public.auth_org_ids()))
  with check (org_id is not null and org_id in (select public.auth_org_ids()));

create policy "influencer_views delete own org" on public.influencer_views
  for delete to authenticated
  using (org_id is not null and org_id in (select public.auth_org_ids()));

-- `nodes_type_check` viveva solo sul database vero, mai in una migration (vedi il commento in
-- `org-data/checks.ts`): senza un DDL qui, `influencer` non passerebbe mai il CHECK che decide se
-- `nodes.type` è lecito, non importa quanto `node-data.ts` lo conosca.
alter table public.nodes drop constraint if exists nodes_type_check;

alter table public.nodes add constraint nodes_type_check check (
  type in (
    'text', 'image', 'video', 'doc', 'iframe',
    'social_account_feed', 'social_post_mockup', 'products', 'ads',
    'influencer'
  )
);

commit;
