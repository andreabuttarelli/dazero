-- LA STORIA DI UN NODO CHE PRODUCE: ogni giro è una riga, e nessuno ne cancella un altro.
--
-- Finora `ref_id` era tutto: rigenerare lo sovrascriveva e la generazione di prima diventava
-- irrecuperabile DAL NODO. L'asset restava in `brand_media` — nessun file perso — ma il nodo non
-- sapeva più che era suo, quindi ritrovarlo voleva dire cercare a mano in una libreria dove ogni
-- brand ha centinaia di immagini che si somigliano. Il difetto non è la perdita del file: è la
-- perdita del LEGAME, e un legame perso non si ricostruisce da nessuna parte.
--
-- `ref_id` RESTA, e non è ridondanza: è «quella che si vede adesso». Senza, la tela dovrebbe
-- dedurre da sola quale mostrare — l'ultima? quella scelta? — e la domanda «cosa stavo guardando»
-- non avrebbe risposta dopo una ricarica. Con le due cose insieme la storia dice cosa è stato
-- fatto e `ref_id` dice dove si è fermato lo sguardo.
--
-- PERCHÉ UNA TABELLA E NON UN JSONB SULLA RIGA. Un array in colonna era la strada corta, e la sua
-- fine si vede: nessuna FK verso `brand_media`, quindi un id inventato ci entra e nessuno se ne
-- accorge finché la tela non prova a disegnarlo; nessun `created_at` per riga senza scriverselo a
-- mano dentro l'oggetto; e soprattutto nessuna interrogazione possibile — «quanto ha speso questo
-- brand sulla tela», «quale prompt ha dato il risultato tenuto» diventano scansioni di JSON. È la
-- stessa ragione per cui `params` INVECE resta jsonb: lì dentro ci sono le scelte del modello, che
-- cambiano quando un provider aggiunge un parametro; qui dentro c'è un fatto — questo giro ha
-- prodotto questo asset — e i fatti hanno colonne.
--
-- IL PROMPT E IL MODELLO SI COPIANO QUI, e questa è l'unica copia che questo schema si concede.
-- Ovunque altrove una tile PUNTA e non duplica, perché due verità sullo stesso oggetto sono una
-- che invecchia. Qui è il contrario: il prompt sulla riga del nodo è quello che si sta scrivendo
-- ADESSO, e cambia dieci volte dopo che un giro è partito. Rimandare a lui significherebbe
-- raccontare che l'immagine di ieri è nata dalla frase di stamattina — una storia che mente.
-- Un'esecuzione è un fatto avvenuto: si congela.
--
-- CANCELLARE IL NODO CANCELLA LA SUA STORIA (`on delete cascade`): una storia senza il nodo che
-- l'ha fatta non è consultabile da nessuna superficie. L'ASSET invece NON cade — `on delete set
-- null` — perché vive nella libreria del brand come ogni altro, e un'immagine tolta dalla libreria
-- deve lasciare la riga che dice «qui c'era un giro», non far sparire la storia attorno.

create table if not exists public.brand_canvas_item_runs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.brand_canvas_items (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  -- L'asset che questo giro ha prodotto. Null quando la libreria lo ha perso per strada: la riga
  -- resta a dire che il giro è stato pagato, che è l'informazione che serve di più quando manca.
  media_id uuid references public.brand_media (id) on delete set null,

  -- Con cosa è stato fatto, congelato. Vedi sopra: il nodo nel frattempo è cambiato.
  prompt text not null,
  model text,
  params jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- La lettura calda è una sola: «i giri di questi nodi, nell'ordine in cui sono stati fatti»,
-- chiesta per tutti i nodi di una tela in un colpo. `item_id` davanti perché è il filtro, e
-- `created_at` dietro perché è l'ordine — invertiti, l'indice non servirebbe al filtro.
create index if not exists brand_canvas_item_runs_item_idx
  on public.brand_canvas_item_runs (item_id, created_at);

alter table public.brand_canvas_item_runs enable row level security;

-- Lo stesso cancello della tela a cui appartiene: `auth_brand_ids()` copre i brand posseduti e
-- quelli condivisi. Una storia visibile solo a chi ha premuto il bottone sarebbe un registro che
-- il resto del team non può leggere, sulla stessa tela che tutti guardano.
drop policy if exists "brand_canvas_item_runs via brand" on public.brand_canvas_item_runs;
create policy "brand_canvas_item_runs via brand" on public.brand_canvas_item_runs
  for all
  using (brand_id in (select auth_brand_ids()))
  with check (brand_id in (select auth_brand_ids()));
