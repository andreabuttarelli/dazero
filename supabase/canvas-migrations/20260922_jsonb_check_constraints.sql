-- L'ULTIMA RIGA DI DIFESA per due colonne jsonb: `nodes.data` e `ad_campaigns.targeting`/
-- `placements`. `insert_row`/`update_row` (org-data/write-tool.ts) già rifiutano un `data` che non
-- rispetta il `type` del nodo, con un errore che nomina il campo — ma quel controllo vive in
-- codice applicativo, e questo database ha 98 file che scrivono con la service-role key, che
-- bypassa le RLS e non passa MAI da write-tool.ts: il cron, l'agente di chat, uno script. Un CHECK
-- qui è l'unica regola che ogni scrittore incontra, chiunque sia — vedi `checks.ts` per lo stesso
-- ragionamento sulle colonne enum.
--
-- DELIBERATAMENTE PERMISSIVO, e non per pigrizia: un CHECK qui dentro non si allenta mai senza
-- rompere le righe che già lo rispettano, ma STRINGERLO vuol dire rivalidare ogni riga esistente
-- — una migrazione dei dati, non solo dello schema. Quindi si impongono SOLO i campi che il
-- discriminante rende obbligatori (`type`/`mode` e i loro pochi campi required) e i loro enum,
-- mai un `minLength`, un `format`, un tetto numerico: quelli restano dove sono già oggi, nel
-- livello che dà il messaggio buono — Zod in `$lib/canvas/node-data.ts` e
-- `org-data/jsonb-schemas.ts`, che un CHECK fallito non sa dare (Postgres risponde con un 23514
-- generico, tradotto da `explainOrgWriteError` in `write-tool.ts` solo quando la scrittura passa
-- da lì — uno script con la service-role key vede solo l'SQLSTATE).
--
-- GENERATO DA CODICE, NON SCRITTO A MANO: ogni schema qui sotto è l'output letterale di
-- `looseNodeJsonSchema(type)` in `src/lib/canvas/node-data.ts` (i nove tipi di `nodes.type`) o
-- della stessa derivazione applicata agli schemi Zod di `ad_campaigns.targeting`/`placements` in
-- `org-data/jsonb-schemas.ts`. Se uno di quegli schemi cambia, questa migrazione invecchia in
-- silenzio finché qualcuno non la rigenera — lo stesso rischio che `checks.ts` accetta per le
-- stesse ragioni. Rigenerare: `npx tsx -e "import {NODE_DATA_SCHEMAS,NODE_TYPES,looseNodeJsonSchema}
-- from './src/lib/canvas/node-data.ts'; for (const t of NODE_TYPES) console.log(t, JSON.stringify(
-- looseNodeJsonSchema(t)))"` e incollare l'output nei `case` sotto.
--
-- COSA NON C'È QUI, e perché: `posts.per_platform`, `brands.palette`/`target`,
-- `ad_creatives.media`, `social_posts.*` non hanno ancora una forma reale in nessun repository del
-- nuovo schema (vedi `jsonb-schemas.ts`, `kind: 'free_form'`) — imporre un CHECK su un campo che
-- nessun codice popola ancora sarebbe un contratto inventato qui prima che nel codice che lo usa,
-- esattamente il difetto che questo giro doveva chiudere per `nodes.data`, non riaprirlo altrove.
-- `competitor_ads.raw`, `canvas_events.before`/`after`, `chat_messages.tool_calls` restano liberi
-- di proposito (vedi gli stessi commenti in `jsonb-schemas.ts`) e non hanno un CHECK per lo stesso
-- motivo per cui non hanno uno schema Zod.

begin;

create extension if not exists pg_jsonschema cascade;

-- `nodes.data`: il discriminante è `nodes.type`, quindi il CHECK sceglie lo schema in base a lui.
-- `nodes_type_check` (già in produzione) garantisce che `type` sia uno dei nove valori — qui si
-- assume vero, come `write-tool.ts` assume vero lo stesso vincolo prima di guardare `data`.
alter table public.nodes drop constraint if exists nodes_data_shape_check;

alter table public.nodes add constraint nodes_data_shape_check check (
  case type
    when 'text' then extensions.json_matches_schema(
      '{"type":"object","required":["prompt"],"properties":{"prompt":{"type":"string"}}}', data
    )
    when 'image' then extensions.json_matches_schema(
      '{"type":"object","required":["prompt"],"properties":{"prompt":{"type":"string"}}}', data
    )
    when 'video' then extensions.json_matches_schema(
      '{"type":"object","required":["prompt"],"properties":{"prompt":{"type":"string"}}}', data
    )
    when 'doc' then extensions.json_matches_schema(
      '{"type":"object","required":["content","public"],"properties":{"content":{"type":"string"},"public":{"type":"boolean"}}}',
      data
    )
    when 'iframe' then extensions.json_matches_schema('{"type":"object","required":[],"properties":{}}', data)
    when 'social_account_feed' then extensions.json_matches_schema(
      '{"type":"object","required":["platform","handle"],"properties":{"platform":{"type":"string","enum":["instagram","facebook","x","linkedin","tiktok","threads","youtube","reddit","pinterest"]},"handle":{"type":"string"}}}',
      data
    )
    when 'social_post_mockup' then extensions.json_matches_schema('{"type":"object","required":[],"properties":{}}', data)
    when 'products' then extensions.json_matches_schema(
      '{"type":"object","required":["type","url"],"properties":{"type":{"type":"string","enum":["shopify","woocommerce"]},"url":{"type":"string"}}}',
      data
    )
    when 'ads' then extensions.json_matches_schema(
      '{"type":"object","required":["mode","country"],"properties":{"mode":{"type":"string","enum":["page","search"]},"country":{"type":"string"}}}',
      data
    )
    when 'influencer' then extensions.json_matches_schema(
      '{"type":"object","required":["influencer_id"],"properties":{"influencer_id":{"type":"string"}}}',
      data
    )
    else false
  end
);

-- `ad_campaigns.targeting`: ogni campo di `AdTargeting` (zernio-ads.ts) è opzionale — nessun
-- `required`, quindi il CHECK più onesto è "un oggetto", non uno più stretto che inventerebbe un
-- vincolo che il provider stesso non impone. `null` resta ammesso: la colonna è nullable.
alter table public.ad_campaigns drop constraint if exists ad_campaigns_targeting_shape_check;

alter table public.ad_campaigns add constraint ad_campaigns_targeting_shape_check check (
  targeting is null or extensions.json_matches_schema('{"type":"object"}', targeting)
);

-- `ad_campaigns.placements`: `string[]` in `CreateStandaloneAdInput.placements` — un array di
-- stringhe è l'unico vincolo che quel tipo impone davvero, niente enum di valori (Meta ne aggiunge
-- di nuovi più spesso di quanto la migration venga scritta, lo stesso motivo per cui il documento
-- di progetto tiene `targeting`/`placements` come jsonb libero da uno schema del database).
alter table public.ad_campaigns drop constraint if exists ad_campaigns_placements_shape_check;

alter table public.ad_campaigns add constraint ad_campaigns_placements_shape_check check (
  placements is null or extensions.json_matches_schema('{"type":"array","items":{"type":"string"}}', placements)
);

commit;
