-- LA PAGINA INCORPORATA: una tile che porta il suo contenuto invece di puntarci.
--
-- È il rovescio del nodo che produce. `gen` nasce vuoto e si riempie girando; questo nasce pieno e
-- non gira mai — porta una pagina già esistente, come una nota porta un testo già scritto. Per
-- questo `ref_id` resta null SEMPRE, e non «finché non ha prodotto»: non c'è nessuna riga di
-- nessuna tabella a cui puntare, e un `ref_id` facoltativo qui inviterebbe a inventarne una.
--
-- DUE MODI DI RIEMPIRLO, E SONO DUE COLONNE, NON UNA.
--
-- La strada scartata era `body` che tiene l'uno o l'altro con una colonna a dire quale. Un campo
-- solo, e sembra più economico: non lo è. `body` è già «il testo di una nota», e farne «l'URL, o
-- l'HTML, o il testo — dipende dai due vicini» dà un campo che significa tre cose diverse a
-- seconda di chi gli sta accanto. È esattamente la ragione per cui `medium`, `model` e `prompt`
-- sono colonne e non un JSON: il database può dire cosa c'è dentro solo se sa cosa dovrebbe
-- esserci. E un discriminatore è una terza verità che può divergere dalle altre due — `source =
-- 'url'` con l'URL vuoto e l'HTML pieno è una riga che passa ogni check e non si disegna.
--
-- Con due colonne il discriminatore non serve: quale delle due è piena DICE già quale modo è, e
-- non c'è modo di scriverlo sbagliato. Il vincolo qui sotto impone uno e uno solo.
--
-- UNO SOLO, NON «almeno uno». Entrambi pieni è una tile che il renderer non sa disegnare — e non
-- sceglierebbe: sceglierebbe chi ha scritto il renderer, in silenzio, e l'altro campo resterebbe
-- lì a dire una cosa che non succede. Nessuno dei due è un riquadro bianco che non dice perché.
-- È la stessa domanda di `brand_canvas_items_ref_shape` («questa tile dice cosa mostra?») posta
-- un livello più in basso, e si scrive nella stessa forma.
--
-- PERCHÉ L'HTML STA NEL DATABASE E NON VIENE SANIFICATO QUI. La difesa è la sandbox del browser,
-- non un filtro sulla scrittura, e la scelta è deliberata: un sanificatore lato server è una
-- lista di tag che si può aggirare — ne esiste una storia intera — e soprattutto TOGLIEREBBE IL
-- PRODOTTO. Chi incolla un embed ci mette dentro uno `<script>` perché è così che gli embed sono
-- fatti; sanificarlo darebbe un riquadro vuoto e nessuna spiegazione. Quindi l'HTML si conserva
-- com'è e si esegue in una sandbox SENZA `allow-same-origin`, dove quello script gira sopra
-- un'origine opaca che non vede né i cookie né il DOM dell'app. Il dettaglio che rende la cosa
-- obbligatoria invece che preferibile sta in `iframe-node.ts`, accanto al codice che la applica.

alter table public.brand_canvas_items
  -- L'indirizzo della pagina. Null quando la tile porta invece il suo HTML.
  add column if not exists url text,
  -- L'HTML da mostrare. Null quando la tile porta invece un indirizzo.
  add column if not exists html text;

-- `iframe` entra fra i tipi ammessi.
alter table public.brand_canvas_items
  drop constraint if exists brand_canvas_items_ref_kind_check;

alter table public.brand_canvas_items
  add constraint brand_canvas_items_ref_kind_check
  check (ref_kind in ('post', 'media', 'document', 'memory', 'graphic', 'note', 'gen', 'iframe'));

-- La forma, con un caso in più. `iframe` si comporta come `note`: porta il suo contenuto e non
-- punta a niente, mai — a differenza di `gen`, che il riferimento lo acquista girando.
alter table public.brand_canvas_items
  drop constraint if exists brand_canvas_items_ref_shape;

alter table public.brand_canvas_items
  add constraint brand_canvas_items_ref_shape check (
    (ref_kind in ('note', 'iframe') and ref_id is null)
    or (ref_kind = 'gen')
    or (ref_kind not in ('note', 'gen', 'iframe') and ref_id is not null)
  );

-- Un iframe porta O un indirizzo O dell'HTML, mai tutti e due e mai nessuno dei due. E nessun
-- altro tipo porta l'uno o l'altro: lasciare `url` su un post vorrebbe dire un secondo posto dove
-- cercare il suo indirizzo, che è la definizione di due verità sullo stesso oggetto.
alter table public.brand_canvas_items
  drop constraint if exists brand_canvas_items_iframe_source;

alter table public.brand_canvas_items
  add constraint brand_canvas_items_iframe_source check (
    case
      when ref_kind = 'iframe' then (url is null) <> (html is null)
      else url is null and html is null
    end
  );

-- Solo `http:` e `https:`. `javascript:` in un `src` esegue sull'origine di CHI INCORPORA, quindi
-- una tile scritta da un membro del brand girerebbe con la sessione di chi la apre — i brand sono
-- condivisi, e questo è XSS depositato. `data:` e `file:` portano lo stesso problema per strade
-- diverse. Il controllo c'è anche nel client e nell'endpoint, dove può spiegarsi; qui sta perché
-- è l'unico punto che nessuna strada di scrittura può aggirare — e l'agente scrive di suo.
--
-- Il controllo è sul PREFISSO e non sulla raggiungibilità: che l'indirizzo esista, risponda o si
-- lasci incorporare lo scopre il browser di chi guarda, non Postgres.
alter table public.brand_canvas_items
  drop constraint if exists brand_canvas_items_iframe_url_scheme;

alter table public.brand_canvas_items
  add constraint brand_canvas_items_iframe_url_scheme check (
    url is null or url ~* '^https?://'
  );
