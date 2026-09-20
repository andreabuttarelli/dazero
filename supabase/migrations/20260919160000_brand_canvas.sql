-- IL CANVAS: dove sta una cosa su una tela, e nient'altro.
--
-- Una tile NON duplica l'oggetto che mostra: porta un riferimento (`ref_kind`, `ref_id`) e la sua
-- posizione. Il post resta in `posts`, il media in `brand_media`, il documento in
-- `brand_documents`. Copiare qui il contenuto significherebbe due verità sullo stesso oggetto e
-- una tela che mostra un titolo vecchio il giorno dopo — che è precisamente il difetto per cui
-- `graphic_designs` tiene la spec e non i pixel.
--
-- `ref_kind` è un check e non quattro FK nullable: quattro colonne e quattro vincoli per la stessa
-- domanda («cosa mostra questa tile?») sarebbero quattro posti da cambiare al quinto tipo. È la
-- stessa scelta di `graphic_designs.target_kind`, e per la stessa ragione.
--
-- NIENTE CASCATA DAL REFERENTE, e non è una dimenticanza: un post cancellato deve lasciare una
-- tile che dice «questa cosa non c'è più», non sparire dalla tela di soppiatto mentre qualcuno la
-- sta guardando. La tile si toglie quando la toglie una persona; il brand invece cade in cascata,
-- perché senza brand la tela non esiste.

create table if not exists public.brand_canvases (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null default 'Canvas',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_canvases_brand_idx
  on public.brand_canvases (brand_id, updated_at desc);

create table if not exists public.brand_canvas_items (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.brand_canvases (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  -- Cosa mostra la tile. L'oggetto vive nella sua tabella: qui c'è solo il puntatore.
  ref_kind text not null check (ref_kind in ('post', 'media', 'document', 'memory', 'graphic', 'note')),
  -- Null solo per 'note', che è l'unico tipo che non punta a niente: il suo testo sta in `body`.
  ref_id uuid,
  -- Il testo di una nota. Per ogni altro tipo resta null — il contenuto non si copia qui.
  body text,

  -- Posizione e dimensione in unità di tela, non in pixel: lo zoom è una proprietà della vista,
  -- non del dato, e salvare pixel legherebbe la tela alla finestra di chi l'ha spostata.
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 320,
  h double precision not null default 320,
  -- Chi sta sopra quando due tile si toccano.
  z integer not null default 0,

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una nota porta un testo; tutto il resto porta un riferimento. Senza questo vincolo una tile
  -- può esistere senza dire cosa mostra, e il renderer si trova davanti a un buco.
  constraint brand_canvas_items_ref_shape check (
    (ref_kind = 'note' and ref_id is null) or (ref_kind <> 'note' and ref_id is not null)
  ),
  -- Una larghezza o un'altezza a zero è una tile invisibile che occupa comunque memoria e
  -- selezione: si rifiuta qui, dove nessuna strada di scrittura può aggirarla.
  constraint brand_canvas_items_size check (w > 0 and h > 0)
);

-- La lettura calda è «tutte le tile di questa tela», in ordine di impilamento.
create index if not exists brand_canvas_items_canvas_idx
  on public.brand_canvas_items (canvas_id, z);

-- La seconda: «dove compare questo oggetto», per non metterlo due volte sulla stessa tela.
create index if not exists brand_canvas_items_ref_idx
  on public.brand_canvas_items (brand_id, ref_kind, ref_id);

-- `updated_at` non si lascia al codice: ogni strada di scrittura — browser, agente, API — deve
-- muoverlo, o la precondizione «la riga è ancora quella che ho letto» non vale niente. È la stessa
-- lezione della migrazione 0224 su `posts`, applicata prima che il difetto si presenti.
create or replace function public.set_canvas_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brand_canvases_set_updated_at on public.brand_canvases;
create trigger brand_canvases_set_updated_at before update on public.brand_canvases
  for each row execute function public.set_canvas_updated_at();

drop trigger if exists brand_canvas_items_set_updated_at on public.brand_canvas_items;
create trigger brand_canvas_items_set_updated_at before update on public.brand_canvas_items
  for each row execute function public.set_canvas_updated_at();

alter table public.brand_canvases enable row level security;
alter table public.brand_canvas_items enable row level security;

-- Lo stesso cancello del resto dell'app: `auth_brand_ids()` copre i brand posseduti e quelli
-- condivisi. Una tela è di chi è il brand, non di chi l'ha aperta — un canvas visibile solo a chi
-- lo ha creato sarebbe una lavagna in una stanza chiusa a chiave.
drop policy if exists "brand_canvases via brand" on public.brand_canvases;
create policy "brand_canvases via brand" on public.brand_canvases
  for all
  using (brand_id in (select auth_brand_ids()))
  with check (brand_id in (select auth_brand_ids()));

drop policy if exists "brand_canvas_items via brand" on public.brand_canvas_items;
create policy "brand_canvas_items via brand" on public.brand_canvas_items
  for all
  using (brand_id in (select auth_brand_ids()))
  with check (brand_id in (select auth_brand_ids()));
