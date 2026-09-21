-- LE CONNESSIONI DELLA TELA: perché due cose stanno insieme.
--
-- La tela nasce come bacheca e gli archi erano spenti di proposito — `CanvasFlow.svelte` lo dice:
-- «metà della superficie della libreria è per un grafo, che questa bacheca non è». Si accendono
-- adesso perché la tela ha un secondo lettore, l'agente, e per lui una linea non è decorazione:
-- è l'unico modo di dire che QUESTO post nasce da QUEL documento, e di ritrovarlo al turno dopo.
--
-- `kind` È UN ELENCO CHIUSO, non un'etichetta libera, e la ragione è chi scrive. Un modello a cui
-- si lascia il testo libero conia un verbo nuovo a ogni turno — «nasce da», «derivato», «from» —
-- e il giorno dopo non sa più ritrovare quello che ha scritto lui stesso. Tre parole scelte una
-- volta sono un vocabolario; il testo libero è un campo note che nessuna query attraversa.
-- È la stessa scelta di `ref_kind` qui accanto e di `graphic_designs.target_kind`.
--
-- GLI ESTREMI SONO TILE, NON OGGETTI. Si collega quello che sta sulla tela, e una tile porta già
-- il suo referente: puntare agli oggetti significherebbe poter collegare due cose che sulla tela
-- non ci sono, e disegnare un arco che parte dal nulla. La cascata segue le tile per la stessa
-- ragione — tolta la tile, la linea che la toccava non ha più due capi.
--
-- Nessuna cascata invece dal REFERENTE (il post, il documento): quella sta sulla tile, che
-- sopravvive come riquadro «questa cosa non c'è più», e la connessione con lei.

create table if not exists public.brand_canvas_edges (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.brand_canvases (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  source_item_id uuid not null references public.brand_canvas_items (id) on delete cascade,
  target_item_id uuid not null references public.brand_canvas_items (id) on delete cascade,

  -- Il vocabolario, al completo:
  --   derives_from  — il bersaglio è nato dalla sorgente (il post dal documento che l'ha ispirato)
  --   responds_to   — il bersaglio risponde alla sorgente (la risposta al commento, la variante al brief)
  --   groups_with   — stanno insieme senza che uno venga dall'altro (i tre post di una campagna)
  kind text not null check (kind in ('derives_from', 'responds_to', 'groups_with')),

  -- Quel che una persona ha scritto sulla linea. La semantica sta in `kind`: questo è una
  -- didascalia, e resta null quasi sempre.
  label text,

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un cappio non dice niente e disegna un riccio sopra la tile: si rifiuta qui, dove nessuna
  -- strada di scrittura può aggirarlo.
  constraint brand_canvas_edges_no_self_loop check (source_item_id <> target_item_id)
);

-- La lettura calda è «tutti gli archi di questa tela», come per le tile.
create index if not exists brand_canvas_edges_canvas_idx
  on public.brand_canvas_edges (canvas_id);

-- La seconda: «cosa tocca questa tile», che serve a disegnarla e a cancellarla.
create index if not exists brand_canvas_edges_source_idx
  on public.brand_canvas_edges (source_item_id);
create index if not exists brand_canvas_edges_target_idx
  on public.brand_canvas_edges (target_item_id);

-- Una connessione per verso e per tipo: ritrascinare la stessa linea la sposta, non ne accatasta
-- una seconda sopra la prima. Il verso conta — A deriva da B non è B deriva da A — quindi la
-- coppia inversa resta un arco legittimo e distinto.
create unique index if not exists brand_canvas_edges_once
  on public.brand_canvas_edges (canvas_id, source_item_id, target_item_id, kind);

-- `updated_at` non si lascia al codice, per la stessa ragione delle tile: ogni strada di scrittura
-- — browser, agente, API — deve muoverlo, o «la riga è ancora quella che ho letto» non vale niente.
drop trigger if exists brand_canvas_edges_set_updated_at on public.brand_canvas_edges;
create trigger brand_canvas_edges_set_updated_at before update on public.brand_canvas_edges
  for each row execute function public.set_canvas_updated_at();

alter table public.brand_canvas_edges enable row level security;

-- Lo stesso cancello delle tile: una tela è di chi è il brand.
drop policy if exists "brand_canvas_edges via brand" on public.brand_canvas_edges;
create policy "brand_canvas_edges via brand" on public.brand_canvas_edges
  for all
  using (brand_id in (select auth_brand_ids()))
  with check (brand_id in (select auth_brand_ids()));
