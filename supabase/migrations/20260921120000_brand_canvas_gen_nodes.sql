-- IL NODO CHE PRODUCE: un prompt, un modello, e quel che ne esce.
--
-- Le altre tile PUNTANO a una cosa che esiste già. Questa no: nasce vuota, porta le istruzioni per
-- fare qualcosa, e solo dopo aver girato ha un asset da mostrare. È l'unico tipo che attraversa
-- quel confine, e `brand_canvas_items_ref_shape` lo vietava — diceva che solo una nota può stare
-- senza `ref_id`, il che è vero per una bacheca di cose fatte e falso per una tela che le fa.
--
-- IL RISULTATO RESTA UN RIFERIMENTO, e non si copia qui. Quando il nodo gira, l'immagine finisce
-- in `brand_media` come ogni altra e `ref_id` la nomina: la stessa regola di tutte le altre tile,
-- per la stessa ragione — due verità sullo stesso oggetto sono una che invecchia. Prima di girare
-- `ref_id` è null, e questo è lo stato normale del tipo, non una riga incompleta.
--
-- PERCHÉ COLONNE E NON UN JSON IN `body`. `body` è il testo di una nota, e infilarci dentro
-- modello, prompt e parametri darebbe un campo che significa due cose diverse a seconda del
-- vicino. Con le colonne il database può dire che `medium` è uno dei tre e non «imagge», e
-- `write-rules.ts` porta quel vincolo fino all'agente come una frase invece che come un 23514.
--
-- `params` INVECE RESTA JSON, e non è incoerenza: aspect ratio, durata e audio sono i limiti del
-- MODELLO, non della tela — stanno in `media-model-slots` accanto al modello che li governa, e
-- ricopiarli qui in colonne significherebbe una migrazione ogni volta che un provider aggiunge un
-- parametro. Qui si tiene quel che l'utente ha scelto; a dire se è lecito è il catalogo.

alter table public.brand_canvas_items
  add column if not exists medium text
    check (medium is null or medium in ('text', 'image', 'video')),
  add column if not exists model text,
  add column if not exists prompt text,
  add column if not exists params jsonb not null default '{}'::jsonb;

-- `gen` entra fra i tipi ammessi.
alter table public.brand_canvas_items
  drop constraint if exists brand_canvas_items_ref_kind_check;

alter table public.brand_canvas_items
  add constraint brand_canvas_items_ref_kind_check
  check (ref_kind in ('post', 'media', 'document', 'memory', 'graphic', 'note', 'gen'));

-- La forma, riscritta per tre casi invece di due:
--   note — porta un testo, non punta a niente, mai;
--   gen  — punta al suo risultato QUANDO ce l'ha, e prima è null: è il tipo che si riempie;
--   gli altri — puntano sempre a qualcosa, come prima.
alter table public.brand_canvas_items
  drop constraint if exists brand_canvas_items_ref_shape;

alter table public.brand_canvas_items
  add constraint brand_canvas_items_ref_shape check (
    (ref_kind = 'note' and ref_id is null)
    or (ref_kind = 'gen')
    or (ref_kind not in ('note', 'gen') and ref_id is not null)
  );

-- Un nodo che produce DEVE dire cosa produce: senza `medium` non si sa quale motore chiamare né
-- quali archi accetta, e sarebbe una tile che occupa spazio senza poter girare. Il vincolo vale
-- solo per `gen`, perché per tutti gli altri il medium lo porta già l'oggetto riferito.
alter table public.brand_canvas_items
  drop constraint if exists brand_canvas_items_gen_medium;

alter table public.brand_canvas_items
  add constraint brand_canvas_items_gen_medium check (
    ref_kind <> 'gen' or medium is not null
  );
