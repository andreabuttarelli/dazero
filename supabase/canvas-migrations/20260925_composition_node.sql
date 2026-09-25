-- IL NODO `composition`: compone più immagini a monte in una scena 3D animata (griglia inclinata,
-- carosello, …), fase 2 di 4 — il motore puro (`LAYOUTS`, `CAMERA_PRESETS`, `createCompositionScene`,
-- `src/lib/canvas/composition/`) è già committato; questo nodo è il primo posto che lo usa sulla
-- tela. L'export in video arriva con la fase 3: fino ad allora il nodo ha `layout`/`camera`/
-- `background`/`duration`/`aspect` e nessun `refId` valorizzato.
--
-- `data.layout`/`data.camera.preset` sono validati contro `LAYOUTS`/`CAMERA_PRESETS` da
-- `node-data.ts` — un CHECK non può leggere quelle tabelle TypeScript, la stessa scelta di
-- `nodes_data_shape_check` per ogni altro campo che l'app valida più a fondo di quanto il
-- database possa.

begin;

alter table public.nodes drop constraint if exists nodes_type_check;

alter table public.nodes add constraint nodes_type_check check (
  type in (
    'text', 'image', 'video', 'doc', 'iframe',
    'social_account_feed', 'social_post_mockup', 'products', 'ads',
    'influencer', 'list', 'select', 'effects', 'composition'
  )
);

commit;
