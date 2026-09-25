-- IL NODO `effects`: una PILA di filtri (pixel art, dither, glitch, …) sopra un'immagine a monte,
-- fase 2 di 3 — solo il tipo, l'editor della pila arriva con la fase 3. Il motore puro che applica
-- gli effetti (`EFFECTS`, `applyStack`, `src/lib/canvas/effects/`) è già committato; questo nodo è
-- il primo posto che lo usa sulla tela.
--
-- `data.effects`: un array di `{ id, params }`, validato contro `EFFECTS` da `node-data.ts` — un
-- CHECK non può leggere quella tabella TypeScript, quindi qui non si impone niente sugli id, la
-- stessa scelta di `nodes_data_shape_check` per ogni altro campo che l'app valida più a fondo di
-- quanto il database possa.
--
-- `data.refId`/`data.sourceRefId`: il risultato applicato e l'asset che lo ha alimentato — la
-- stessa coppia `refId` di un nodo che genera, ma senza `genState`: `applyStack` gira nel browser,
-- non c'è un provider asincrono da aspettare.

begin;

alter table public.nodes drop constraint if exists nodes_type_check;

alter table public.nodes add constraint nodes_type_check check (
  type in (
    'text', 'image', 'video', 'doc', 'iframe',
    'social_account_feed', 'social_post_mockup', 'products', 'ads',
    'influencer', 'list', 'select', 'effects'
  )
);

commit;
