-- LOOP MODE: due tipi di nodo nuovi (`list`, `select`) e un colonna nuova su `nodes_connections`
-- (`mode`), che insieme fanno "genera N combinazioni invece di una" un gesto della tela, non una
-- funzione che esiste solo nel codice — vedi CLAUDE.md, "una funzione non esiste finché non è
-- collegata".
--
-- `list`: N valori (immagini o testo, mai mischiati — `item_kind`), ognuno un'iterazione quando il
-- nodo alimenta un filo `iterate`. Nasce vuoto, si riempie trascinando asset/nodi o scrivendo
-- righe di testo — la stessa idea di `products`/`social_account_feed` che nascono vuoti e si
-- riempiono con una sincronizzazione, solo che qui il riempimento è manuale.
--
-- `select`: sceglie UN item da una lista a monte, per indice — 1-based, la stessa cifra che compare
-- nel nodo e nel thumbnail cliccato (`node-data.ts::selectSchema`). Il suo output ha lo stesso
-- medium della lista che legge, e NON è list-valued: si collega ovunque un nodo singolo si
-- collegherebbe, che è la ragione per cui un `select` esiste — prendere un risultato di un loop e
-- riusarlo come input singolo di un altro nodo, senza ricrearlo a mano.
--
-- `nodes_connections.mode`: fisso (`fixed`, il default — il comportamento di oggi, invariato) o
-- `iterate` — quel filo è un ASSE del prodotto cartesiano/zip che il nodo a valle calcola prima di
-- girare (`loop-plan.ts`). Un filo `fixed` entra in OGNI iterazione; un filo `iterate` ne contribuisce
-- un valore alla volta. La colonna vive sull'ARCO, non sul nodo sorgente: lo stesso nodo `list` può
-- alimentare un filo fisso qui e uno iterato là — è la connessione a decidere come viene letta, non
-- il nodo che la origina.

begin;

alter table public.nodes drop constraint if exists nodes_type_check;

alter table public.nodes add constraint nodes_type_check check (
  type in (
    'text', 'image', 'video', 'doc', 'iframe',
    'social_account_feed', 'social_post_mockup', 'products', 'ads',
    'influencer', 'list', 'select'
  )
);

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
    when 'list' then extensions.json_matches_schema(
      '{"type":"object","required":["item_kind","items"],"properties":{"item_kind":{"type":"string","enum":["image","text"]},"items":{"type":"array"}}}',
      data
    )
    when 'select' then extensions.json_matches_schema(
      '{"type":"object","required":["index"],"properties":{"index":{"type":"integer"}}}',
      data
    )
    else false
  end
);

alter table public.nodes_connections add column if not exists mode text not null default 'fixed';

alter table public.nodes_connections drop constraint if exists nodes_connections_mode_check;

alter table public.nodes_connections add constraint nodes_connections_mode_check check (
  mode in ('fixed', 'iterate')
);

commit;
