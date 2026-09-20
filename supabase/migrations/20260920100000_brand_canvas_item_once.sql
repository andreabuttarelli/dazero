-- Una cosa compare UNA volta per tela: senza questo vincolo un secondo trascinamento della stessa
-- tile inserirebbe una riga nuova invece di spostare quella che c'è, e la tela si riempirebbe di
-- duplicati sovrapposti. È anche ciò che rende possibile l'upsert: senza un indice unico su cui
-- fare `on conflict`, Postgres non sa quale riga aggiornare.
--
-- NON PARZIALE, e la prima versione lo era. Con `where ref_id is not null` PostgREST rifiuta
-- l'upsert — "no unique or exclusion constraint matching the ON CONFLICT specification" — perché
-- la clausola `on conflict (canvas_id, ref_kind, ref_id)` non nomina la condizione dell'indice.
-- Senza la condizione il vincolo copre anche le note, e va bene lo stesso: in Postgres due NULL
-- non sono uguali fra loro, quindi le note (ref_id null) restano quante se ne vogliono.
create unique index if not exists brand_canvas_items_once_per_canvas
  on public.brand_canvas_items (canvas_id, ref_kind, ref_id);
