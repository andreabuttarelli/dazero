# New database schema

Convenzioni valide ovunque, per non ripeterle su ogni tabella:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
- Ogni tabella porta `org_id` — è la radice del tenant, e la RLS si scrive su quella.
- Le FK cancellano a cascata verso il basso (`org` → `project` → `canvas` → `node`).

> **`?`** segna le decisioni ancora aperte: sono domande, non proposte già chiuse.

---

## profiles

Il profilo dell'utente. `id` **è** `auth.users.id` (nessuna chiave separata: due id per la stessa
persona divergono al primo bug).

```
id            uuid primary key references auth.users(id) on delete cascade
email         text not null
name          text
avatar_url    text
created_at
updated_at
```

## orgs

L'organizzazione: la radice del tenant. Tutto appartiene a una org.

```
id            uuid pk
name          text not null
slug          text not null unique     -- serve per gli URL
created_at
updated_at
```

## orgs_members

Chi sta in una org e con che ruolo. **Mancava `org_id`**: senza, la riga non sa a quale org
appartiene e la join non esiste.

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
user_id       uuid not null references profiles(id) on delete cascade
role          text not null check (role in ('owner','admin','member'))
created_at

unique (org_id, user_id)   -- una persona, un ruolo per org
```

`unique` non è un dettaglio: senza, due inviti accettati due volte danno due ruoli diversi alla
stessa persona e l'autorizzazione dipende da quale riga legge per prima.

## orgs_invites

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
email         text not null
role          text not null check (role in ('owner','admin','member'))
token         text not null unique      -- quello che sta nel link
expires_at    timestamptz not null
accepted_at   timestamptz
invited_by    uuid references profiles(id)
created_at

unique (org_id, email) where accepted_at is null
```

Un invito senza scadenza è una porta aperta per sempre; senza `token` il link è indovinabile.

## brands

Collezioni di brands dell'utente.

```
id                 uuid pk
org_id             uuid not null references orgs(id) on delete cascade
name               text not null
slug               text not null
website            text
short_description  text
content            text            -- markdown: voce, tono, note libere
palette            jsonb           -- strutturato: si interroga, il markdown no
target             jsonb           -- idem
logo_url           text
created_at
updated_at

unique (org_id, slug)
```

Ho separato `palette` e `target` da `content`: il markdown va bene per la prosa che un modello
legge, ma un colore che vuoi filtrare o mostrare in una UI dentro un markdown non si interroga.

## projects

Progetti di un'org, indipendenti dai brands.

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
name          text not null
slug          text not null
brand_id      uuid references brands(id) on delete set null   -- ? opzionale
created_at
updated_at

unique (org_id, slug)
```

**? `brand_id` sul progetto.** I progetti sono "indipendenti dai brands", ma un post programmato
ha bisogno di sapere con quale voce parla e su quali account pubblica. Tre strade:
(a) il progetto ha un brand opzionale — semplice, un brand per progetto;
(b) il brand sta sul singolo `scheduled_post` — massima libertà, lo scegli ogni volta;
(c) tabella ponte `projects_brands` — un progetto può servire più brand.
Non l'ho deciso io. Sotto, `scheduled_posts` assume **(a) + override**.

## canvases

**Mancava del tutto.** Il pitch dice *canvas infiniti* al plurale, e i nodi avevano `canvas_id`
senza una tabella dietro.

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
project_id    uuid not null references projects(id) on delete cascade
name          text not null
viewport      jsonb            -- { x, y, zoom }: dove era la vista all'ultima chiusura
created_at
updated_at
```

**? Un progetto = un canvas, o molti?** Come scritto qui, molti. Se invece è sempre uno solo, la
tabella sparisce e `nodes.project_id` basta — ma passare da uno a molti dopo significa migrare
ogni nodo, quindi è meglio deciderlo adesso.

## assets

Assets di tutti i progetti di un'org, divisi per progetto.

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
project_id    uuid references projects(id) on delete cascade   -- null = libreria di org
type          text not null check (type in ('text','image','video','iframe','document'))
url           text
content       text
mime_type     text
bytes         bigint
width         int
height        int
duration_s    numeric          -- video
source        text             -- 'upload' | 'generated' | 'imported'
source_node_id uuid references nodes(id) on delete set null
embedding     vector(1536)
created_at
updated_at
```

`source` + `source_node_id` rispondono alla domanda che nello schema non c'era: **dove finisce
quello che un nodo genera.** Se l'output resta solo dentro il nodo, la libreria non vede mai
niente di generato; se scrive qui, un'immagine fatta sulla tela è riusabile ovunque.

`embedding`: serve `create extension vector`, e un indice — `ivfflat (embedding vector_cosine_ops)`
— altrimenti la ricerca fa un full scan. **? Cosa si embedda**: `content` per il testo, la
caption/descrizione per immagini e video. E 1536 è la dimensione di `text-embedding-3-small`: se
cambi modello, cambia il tipo della colonna.

## products

Prodotti pubblici di Shopify e Woocommerce, associabili ad un brand.

```
id                uuid pk
org_id            uuid not null references orgs(id) on delete cascade
brand_id          uuid not null references brands(id) on delete cascade
platform          text not null check (platform in ('shopify','woocommerce'))
external_id       text not null      -- l'id sulla piattaforma di origine
handle            text
title             text not null
description       text
price             numeric
currency          text
url               text
images            jsonb              -- [{ url, alt, position }]
available         boolean
synced_at         timestamptz not null
created_at
updated_at

unique (brand_id, platform, external_id)
```

`unique` è ciò che rende la risincronizzazione un upsert invece di un duplicato a ogni giro.
`synced_at` dice quanto è vecchio il dato — senza, non sai mai se il prezzo è di oggi o di marzo.

## scheduled_posts

```
id                uuid pk
org_id            uuid not null references orgs(id) on delete cascade
project_id        uuid not null references projects(id) on delete cascade
brand_id          uuid references brands(id) on delete set null   -- override del brand
node_id           uuid references nodes(id) on delete set null    -- da quale mockup nasce

status            text not null default 'draft'
                  check (status in ('draft','scheduled','publishing','published','failed'))
scheduled_at      timestamptz
published_at      timestamptz
error             text

caption           text               -- il default
per_platform      jsonb              -- le varianti, vedi sotto
media             jsonb              -- [{ asset_id, order }]

zernio_post_id    text
zernio_account_id text
created_at
updated_at
```

**`per_platform jsonb` al posto delle colonne per piattaforma.** `x_caption`, `thread_caption`,
`reddit_title`, `reddit_body`, `reddit_link` sono cinque colonne per tre piattaforme: alla quarta
ne aggiungi altre tre, e ogni post ne ha sempre la maggioranza a NULL. Dentro il jsonb la stessa
cosa si scrive così, e una piattaforma nuova non tocca lo schema:

```json
{
  "x":       { "caption": "…" },
  "threads": { "caption": "…" },
  "reddit":  { "title": "…", "body": "…", "link": "…" },
  "instagram": { "caption": "…", "first_comment": "…" }
}
```

**`status` mancava, ed è la colonna che serve di più**: senza, non distingui un post da pubblicare
da uno già uscito da uno fallito, e il worker che pubblica non ha niente su cui fare lock.
`error` dice *perché* è fallito — altrimenti resta solo "non è uscito".

---

## nodes

**Una tabella sola, con il payload in `data jsonb`.** Non è una preferenza estetica: i campi che
hai elencato per tipo sono ~40, quasi tutti NULL su ogni riga, e `social_post_mockup` non è
nemmeno piatto (è un albero di post per piattaforma) — come colonne non ci sta proprio.

È anche già la regola che il codice segue: `src/lib/canvas/graph.ts` dice *«UNA TABELLA SOLA, e
non è estetica: le eccezioni si dichiarano in un posto solo, accanto al modello che le governa,
dove il caso nuovo è una riga e tutti si vedono insieme»*.

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
project_id    uuid not null references projects(id) on delete cascade
canvas_id     uuid not null references canvases(id) on delete cascade
type          text not null
display_name  text
x             numeric not null
y             numeric not null
width         numeric
height        numeric
z             int                  -- ordine di sovrapposizione
data          jsonb not null default '{}'

-- collaborazione (vedi la sezione in fondo)
version       bigint not null default 1
updated_by    uuid references profiles(id)
deleted_at    timestamptz
lock_by       uuid references profiles(id)
lock_at       timestamptz

created_at
updated_at
```

`width`/`height` li avevi solo su `doc` e `iframe`, ma un nodo su una tela si ridimensiona sempre:
stanno sulla tabella, non nel payload.

### Medium e ruolo sono due assi, non uno

Questo è il punto su cui il tuo `graph.ts` è già più avanti della bozza. La sua prima riga dice:

> *Due assi, e confonderli è il difetto che questo file esiste per evitare.*
> **IL MEDIUM** è cosa una cosa È: testo, immagine, video — decide se un arco può esistere.
> **IL RUOLO** è cosa una cosa FA nel prodotto.

La tua lista `type` li mescola: `text`/`image`/`video` sono medium, `social_account_feed`,
`products`, `ads` sono ruoli. Su un asse solo l'elenco cresce **moltiplicando** invece che
sommando (`video_post`, `video_library`, `video_mockup`…).

Proposta, da discutere: il `type` resta uno solo sulla riga, ma il medium si **deriva** da una
tabella di corrispondenza in codice — una riga per tipo, come già fa `graph.ts` — e le regole
sugli archi si scrivono sul medium, mai sul tipo.

| type | medium | genera | note |
|---|---|---|---|
| `text` | text | sì | |
| `image` | image | sì | |
| `video` | video | sì | |
| `doc` | text | no | |
| `iframe` | — | no | non alimenta archi |
| `social_account_feed` | — | no | sorgente: produce post, non un medium |
| `social_post_mockup` | — | no | composizione, non generazione |
| `products` | — | no | sorgente |
| `ads` | — | no | sorgente |

### Come si propaga lo stato di una generazione lunga

Un video ci mette minuti. Nel frattempo chi l'ha lanciato deve vedere "sta girando", e **anche
tutti gli altri sul canvas** — altrimenti in due lanciano la stessa generazione e la pagano due
volte.

**La risposta è: nessun servizio Node esterno, nessun polling dal browser.** Il database è già il
punto di verità, e `postgres_changes` è già il canale. Il ciclo completo:

```
1. click  →  INSERT node_runs (status='running')  +  UPDATE nodes.data.status='running'
                                    ↓
                  Realtime porta l'UPDATE a TUTTI i client aperti  ← lo spinner parte da qui
                                    ↓
2. cron ogni minuto  →  prende le run 'running', chiede a OpenRouter "è pronta?"
                                    ↓
3. pronta  →  INSERT assets  +  UPDATE node_runs(status='done')  +  UPDATE nodes.data
                                    ↓
                  Realtime porta l'UPDATE  ← il video compare a tutti insieme
```

**Il client non fa polling: è sottoscritto.** Lo stato vive in `nodes.data.status`, quindi chi
apre il canvas a metà rendering vede "sta girando" senza aver ricevuto nessun evento — ed è la
cosa che un servizio in memoria non può dare.

#### Perché non un servizio Node che fa polling vivo

È la soluzione che viene in mente per prima, e ha tre problemi che si pagano dopo:

- **Se muore, le generazioni restano appese per sempre.** Un processo che tiene in RAM "sto
  aspettando 12 render" perde tutto al riavvio: nessuno chiederà più a OpenRouter com'è finita, e
  i nodi restano `running` in eterno. Con il cron lo stato è su disco: il tick successivo riprende.
- **Non scala in orizzontale senza un lock.** Due istanze pollano la stessa run e la finalizzano
  due volte — cioè **pagano due volte** e scrivono due asset.
- **È un pezzo di infrastruttura in più da far girare**, mentre il deploy è su Vercel e un cron
  esiste già.

Un servizio dedicato diventa la risposta giusta quando servono **webhook** invece del polling, o
sotto-secondo. Per una generazione da 2-5 minuti, un tick al minuto è indistinguibile.

#### Il lock è la parte che conta

Questo è già risolto nel prodotto (`video-render-queue.ts`) ed è la riga da non perdere:

```sql
update node_runs
   set status = 'finishing', claimed_at = now()
 where id = $1 and status = 'running'
returning *;
-- 0 righe = un altro tick l'ha già presa. Ci si ferma.
```

⚠️ **Va fatto PRIMA di qualsiasi cosa non idempotente** — scrivere il file, addebitare i crediti.
Due tick sovrapposti che finalizzano la stessa run addebitano due volte: è una perdita di soldi
reale, non un difetto estetico.

⚠️ **`attempts` non si incrementa sul claim.** Il commento nel codice esistente spiega perché:
la maggior parte dei claim sono un "è pronta?" su un render sanissimo, e contarli trasforma il
tetto dei tentativi in **una scadenza di N minuti**. Solo i fallimenti veri lo alzano.

#### Le cose che il cron deve fare oltre al lieto fine

- **Timeout.** Una run `running` da più di N minuti va chiusa come `expired`: il provider a volte
  non risponde più, e un nodo che gira per sempre è peggio di uno fallito.
- **Riconciliazione allo stato attuale.** Il client che si riconnette rilegge il nodo, non
  ricostruisce da eventi persi. È per questo che lo stato sta nella riga e non solo nel broadcast.
- **`status='failed'` con `error` leggibile.** "Non è uscito niente" non è una risposta.

#### Webhook, se e quando OpenRouter li offre

Il polling non preclude nulla: un webhook diventerebbe la strada veloce (`INSERT` dello stato
finale appena arriva) e **il cron resterebbe come rete di sicurezza** per i webhook persi — che
si perdono sempre. Le due cose convivono, e si aggiunge la seconda senza smontare la prima.

### I nodi che generano: stato, non solo parametri

`text`, `image` e `video` avevano prompt e modello ma **niente sullo svolgimento**. Una
generazione fallisce, costa e dura minuti: senza stato la UI non sa cosa mostrare e un refresh
perde tutto. Questi campi stanno in `data` per i tre tipi generativi:

```
status        'idle' | 'running' | 'done' | 'failed'
run_id        text          -- il job lato provider
error         text
output_asset_id uuid        -- → assets.id
started_at, finished_at
cost_usd      numeric
```

`src/lib/canvas/gen-history.ts` esiste già e si aspetta una storia: **? le generazioni passate**
restano dentro `data` (solo l'ultima) o vanno in una tabella `node_runs` (tutte)? Se vuoi rigenerare
e confrontare, serve la tabella.

### `data` per tipo

I campi sono i tuoi; qui sotto solo la forma.

**text** — `system_prompt`, `prompt`, `model`, `reasoning` + i campi di stato sopra.

**image** — `prompt`, `model`, `aspect_ratio`, `resolution` + stato.
**? I limiti non si duplicano qui.** `gen-node.ts` è esplicito: formati, durate e tetto del prompt
sono fatti del **modello** e vivono nel catalogo (`media-model-slots`) — riscriverli nello schema
darebbe due verità.

**video** — `prompt`, `model`, `audio`, `aspect_ratio`, `resolution` + stato.

**doc** — `content` (markdown), `public` (bool).
**? `public`**: se un doc è pubblico serve un token/slug per l'URL, altrimenti l'indirizzo è l'id
e chiunque lo indovini entra.

**iframe** — `url` (opt), `content` (codice, opt).
⚠️ È la superficie più pericolosa dello schema. Il codice ha già i test:
`iframe-sandbox.test.ts` vieta `allow-same-origin` accanto ad `allow-scripts` (evasione dal
sandbox → XSS sui brand condivisi) e `iframe-node.test.ts` rifiuta `javascript:`, `data:`,
`file:`. Vale per l'`url` **e** per il `content`.

**social_account_feed** — `platform`, `handle`, `limit`, `after`.
**? Dove finiscono i post scaricati.** Se restano in `data`, un feed da 200 post gonfia la riga e
non si interroga. Meglio una tabella `social_posts` (org_id, node_id, platform, external_id,
caption, media, metrics, posted_at) con `unique (node_id, external_id)`, e nel nodo solo la
query. Vale lo stesso per `products` e `ads`: sono **sorgenti**, e il loro contenuto è una
collezione, non un campo.

**social_post_mockup** — la tua struttura annidata, così com'è:

```json
{
  "general": { "caption": "…", "media": [], "first_comment": "…" },
  "x":       { "posts": [{ "caption": "…", "media": [] }] },
  "threads": { "posts": [{ "caption": "…", "media": [] }] }
}
```

**? Il rapporto con `scheduled_posts`.** Il mockup è la stesura, il post programmato è
l'esecuzione. `scheduled_posts.node_id` sopra tiene il legame: il mockup resta sulla tela anche
dopo la pubblicazione.

**products** — `type` (`shopify`|`woocommerce`), `url`, `limit`, `after`, `only_first_photo`.
**? Il legame con la tabella `products`.** Il nodo punta a un negozio; i prodotti stanno già in una
tabella loro, per brand. O il nodo filtra quella tabella (meglio: una sincronizzazione sola), o
scarica per conto suo (due copie che divergono).

**ads** — le ads pubbliche dei competitor, dalla Meta Ad Library. **Due modalità, sceglie
l'utente**: la libreria le supporta entrambe e rispondono a due domande diverse — *«cosa sta
facendo questo concorrente»* e *«chi sta comprando questo tema»*.

```json
{
  "mode": "page",            // "page" | "search"
  "page_id": "1234567",      // mode=page: la Pagina Facebook del competitor
  "page_name": "Competitor", //   risolto una volta, mostrato nel nodo
  "search_terms": null,      // mode=search: le parole chiave
  "country": "IT",           // la libreria è per paese: obbligatorio
  "active_only": true,
  "limit": 50,
  "after": null              // cursore, come gli altri nodi sorgente
}
```

Un `check` in codice, non nello schema, tiene onesta la coppia: `mode='page'` esige `page_id`,
`mode='search'` esige `search_terms`. Sono due nodi nello stesso tipo, non due tipi.

⚠️ **`country` è obbligatorio**: la Ad Library si interroga per paese, e senza non c'è una
risposta di default — c'è un errore.

Gli annunci scaricati vanno in **`competitor_ads`** (vedi sotto), non dentro `data`: è una
collezione, e 50 annunci dentro una riga di nodo non si interrogano.

Il repo ha già `src/lib/server/ads.ts` (1.724 righe): prima di riscrivere il fetch, **vale la pena
leggerlo** — la parte di libreria pubblica potrebbe esserci già.

## nodes_connections

```
id                uuid pk
org_id            uuid not null references orgs(id) on delete cascade
canvas_id         uuid not null references canvases(id) on delete cascade
source_node_id    uuid not null references nodes(id) on delete cascade
target_node_id    uuid not null references nodes(id) on delete cascade
source_handle     text
target_handle     text
created_at

unique (source_node_id, source_handle, target_node_id, target_handle)
check  (source_node_id <> target_node_id)
```

**`target_handle` è la cosa che mancava di più.** Un video con *frame iniziale* e *frame finale*,
o un nodo testo con *system prompt* e *prompt*, hanno due ingressi diversi: senza sapere in quale
entra un arco, la connessione non si può eseguire. Aggiungerlo dopo vuol dire riscrivere ogni arco
esistente.

`unique` impedisce l'arco doppio, il `check` il cappio su sé stesso. `connect-rules.ts` decide già
quali archi siano leciti *per medium* — il database impedisce solo l'assurdo, la regola di prodotto
resta nel codice.

**? I cicli.** `A → B → A` non li ferma niente qui. Se una catena si esegue a cascata, un ciclo gira
per sempre: o si vieta in `connect-rules.ts`, o si mette un limite di profondità in esecuzione.

## influencers

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
brand_id      uuid references brands(id) on delete set null
name          text not null
description   text
pictures      jsonb            -- [{ asset_id | url }]
created_at
updated_at
```

**? A cosa serve.** Nella bozza è l'unica tabella senza `org_id` e senza relazioni. Se sono
personaggi ricorrenti per i contenuti generati (volto coerente tra immagini e video), allora il
legame vero è verso i nodi generativi — e `pictures` dovrebbe puntare ad `assets`, non a URL
sciolti. Se è un'altra cosa, dimmi quale.

---

## RLS — da scrivere insieme alle tabelle, non dopo

I difetti più cari del prodotto vecchio erano fughe fra tenant: `no-cross-tenant-writes.test.ts`
esiste perché è successo. Il modello qui è semplice, e proprio per questo va imposto in un posto
solo:

```sql
create or replace function auth_org_ids() returns setof uuid
language sql stable security definer as $$
  select org_id from orgs_members where user_id = auth.uid()
$$;

-- su ogni tabella
alter table <t> enable row level security;
create policy org_isolation on <t>
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));
```

⚠️ **Il difetto da evitare è già scritto nello schema**: `assets` porta sia `org_id` sia
`project_id`. Una query per `project_id` che dimentica `org_id` legge oltre il tenant — la RLS la
ferma solo se la policy c'è su *quella* tabella. Per questo la policy va sulla tabella, non sulla
query, e `with check` serve quanto `using`: senza, si legge correttamente e si **scrive** nel
tenant sbagliato.

## Indici minimi

```sql
create index on nodes (canvas_id);
create index on nodes_connections (canvas_id);
create index on nodes_connections (source_node_id);
create index on nodes_connections (target_node_id);
create index on assets (project_id);
create index on assets using ivfflat (embedding vector_cosine_ops);
create index on products (brand_id);
create index on scheduled_posts (status, scheduled_at);   -- la query del worker
create index on orgs_members (user_id);                   -- la legge ogni policy RLS
```

L'ultimo conta più degli altri: `auth_org_ids()` gira a ogni riga di ogni query, su ogni tabella.

---

# Dalla tela alla pubblicazione

**Il canvas è l'area di lavoro grezza.** Quello che ci sta dentro non è pubblicabile: è materiale.
Il passaggio a contenuto vero è un atto esplicito — la **promozione** — e da lì si apre in due
strade che condividono lo stesso contenuto:

```
   CANVAS (per progetto)          POSTS (per BRAND)          DISTRIBUZIONE

   progetto A ┐
   progetto B ┼─ assets ─ promote →  ┌──────────┐  ┌──→ scheduled_posts  (organico)
   progetto C ┘                      │  posts   │──┤
                                     └──────────┘  └──→ ad_creatives     (a pagamento)
                                          ↑                   ↑
                                    post_sources         ad_campaigns
                                    (da quali nodi)
```

I due livelli hanno **due proprietari diversi**: il canvas è del progetto, il post è del brand.
È questo che permette a un post di pescare da tre tele e al calendario di essere uno per brand.

Le tre cose che questo disegno impone allo schema:

1. **`posts` è una tabella a sé**, non un nodo. Un nodo vive su una tela e ha `x, y`; un post ha
   una caption, dei media, un brand e un ciclo di vita. Tenerli nella stessa tabella significa
   trascinarsi `x, y` dentro la coda di pubblicazione.
2. **Un post non sa come verrà distribuito.** Lo stesso post può uscire organico *e* diventare la
   creatività di una campagna — e succede spesso, perché si sponsorizza quello che ha funzionato.
   Se la distribuzione fosse una colonna su `posts`, la seconda strada richiederebbe un duplicato.
3. **Il legame con l'origine resta, ed è molti-a-molti.** `post_sources` dice da quali nodi è
   nato — spesso più d'uno, spesso su tele diverse: si torna indietro per rigenerare, e la tela
   non perde il senso dopo la promozione.

## posts

Il contenuto promosso: la cosa che *può* essere pubblicata, indipendentemente da come.

```
id              uuid pk
org_id          uuid not null references orgs(id) on delete cascade
brand_id        uuid not null references brands(id) on delete cascade

title           text                -- interno, per ritrovarlo
caption         text not null
per_platform    jsonb               -- le varianti: vedi scheduled_posts
media           jsonb not null default '[]'   -- [{ asset_id, order, role }]
link_url        text

status          text not null default 'draft'
                check (status in ('draft','ready','archived'))
created_by      uuid references profiles(id)
actor_kind      text not null default 'user' check (actor_kind in ('user','agent','system'))
created_at
updated_at
```

`media` punta ad `assets`, non a URL sciolti: un'immagine generata sulla tela, promossa in un
post e poi usata come creatività di una campagna deve essere **lo stesso file**, non tre copie.

### Il post NON appartiene a un progetto

**Il post è del brand, non del progetto.** Il calendario è per brand, e un singolo post mette
insieme materiale che viene da tele diverse: la caption scritta in un progetto, l'immagine
generata in un altro, il video preso da un terzo. Legarlo a un progetto solo costringerebbe a
scegliere quale, e la risposta giusta non esiste.

Quello che appartiene a un progetto sono gli **asset** (`assets.project_id`) e i **nodi**. Il post
li *prende*: è un assemblaggio, non un figlio.

```
progetto A ─┐
progetto B ─┼──→ assets ──→ post (del brand) ──→ pubblicazione
progetto C ─┘
```

Per non perdere la provenienza — che serve per tornare alla tela e rigenerare — il legame è
**molti a molti**, non una colonna:

```
## post_sources

post_id     uuid not null references posts(id) on delete cascade
node_id     uuid not null references nodes(id) on delete cascade
role        text            -- 'caption' | 'media' | 'reference'
created_at

primary key (post_id, node_id)
```

Così un post ricorda *tutti* i nodi da cui è nato, su qualunque tela stiano, e da ognuno si torna
indietro. `assets.project_id` continua a dire da quale progetto viene ogni singolo pezzo, quindi
la domanda "cosa ha prodotto questo progetto" resta rispondibile senza mettere `project_id` sul
post.

**? `status` qui è il ciclo redazionale** (bozza → pronto), non quello di pubblicazione: quello
vive su `scheduled_posts` e su `ad_creatives`, perché lo stesso post può essere pubblicato su
Instagram e in attesa su LinkedIn insieme.

---

# Auto publishing organico

## social_accounts

Gli account connessi. Zernio tiene i token — noi teniamo solo gli identificativi, come già fa il
prodotto oggi (`ensureBrandProfile`, `syncBrandAccounts` in `src/lib/server/zernio.ts`).

```
id                  uuid pk
org_id              uuid not null references orgs(id) on delete cascade
brand_id            uuid not null references brands(id) on delete cascade
platform            text not null    -- instagram|facebook|x|linkedin|tiktok|threads|youtube|reddit|pinterest
handle              text
display_name        text
avatar_url          text
zernio_account_id   text not null
zernio_profile_id   text             -- il profilo brand lato Zernio
status              text not null default 'connected'
                    check (status in ('connected','expired','revoked'))
connected_at        timestamptz
last_error          text
created_at
updated_at

unique (brand_id, platform, zernio_account_id)
```

⚠️ **Nessun token qui.** È la regola che il repo già segue per Composio e Zernio: *«no access
token is ever read or logged in this repo»*. Se un token entra nello schema, entra anche nei
backup, nei log e nelle risposte d'errore.

**`status: 'expired'`** è il campo che di solito manca e che serve più di tutti: un account
scaduto fa fallire ogni pubblicazione, e senza un flag lo si scopre dal post che non esce.

## scheduled_posts (rivisto)

Non più "il contenuto", ma **una consegna**: questo post, su questo account, a quest'ora.

```
id                uuid pk
org_id            uuid not null references orgs(id) on delete cascade
post_id           uuid not null references posts(id) on delete cascade
account_id        uuid not null references social_accounts(id) on delete cascade
platform          text not null      -- ridondante ma comodo per gli indici

caption           text               -- override per questa consegna; null = quella del post
media             jsonb              -- idem
scheduled_at      timestamptz
timezone          text not null default 'UTC'

status            text not null default 'draft'
                  check (status in ('draft','scheduled','publishing','published','failed','canceled'))
attempts          int not null default 0
error             text
published_at      timestamptz
external_post_id  text               -- l'id sulla piattaforma
external_url      text               -- il permalink, per aprirlo
zernio_post_id    text

created_by        uuid references profiles(id)
actor_kind        text not null default 'user'
created_at
updated_at

unique (post_id, account_id, scheduled_at)
```

**Una riga per account, non una per post.** Lo stesso post su cinque account sono cinque
consegne: quattro possono riuscire e una fallire, e con una riga sola non sapresti quale.

**`attempts` + `status: 'publishing'`** sono la coppia che impedisce il doppio invio. Il worker
prende il lavoro con un `update ... where status = 'scheduled' and scheduled_at <= now()
returning *` — un lock atomico, senza il quale due cron sovrapposti pubblicano due volte lo stesso
post. È un difetto che si paga in faccia al cliente.

**`timezone`** separato da `scheduled_at`: "ogni martedì alle 9" significa le 9 *del brand*, e
l'ora legale sposta l'istante UTC due volte l'anno.

## post_metrics

```
id                uuid pk
org_id            uuid not null references orgs(id) on delete cascade
scheduled_post_id uuid not null references scheduled_posts(id) on delete cascade
impressions       bigint
reach             bigint
likes             bigint
comments          bigint
shares            bigint
saves             bigint
video_views       bigint
clicks            bigint
fetched_at        timestamptz not null

unique (scheduled_post_id, fetched_at)
```

Una riga per rilevazione, non un aggiornamento in place: le metriche crescono nel tempo e la curva
serve — è quella che dice *quale post vale la pena sponsorizzare*. Il prodotto ha già
`syncZernioAnalytics`.

---

# Ads: campagne, creatività, metriche

**Solo Meta, per ora.** Niente Google, TikTok o LinkedIn: una piattaforma sola tolta di mezzo
l'astrazione prematura — e il repo conferma che è la strada già battuta
(`BOOSTABLE_PLATFORMS = {instagram, facebook}`).

Resta però **una colonna `platform` con un check a un valore solo**, non l'assenza della colonna:
aggiungere `'google'` a un `check` è una riga di migrazione, mentre aggiungere una colonna a una
tabella piena di campagne Meta che non sanno di esserlo è un'altra cosa. Costa nulla oggi e
compra la seconda piattaforma domani.

Il repo ha già `src/lib/server/ads.ts` (1.724 righe) con un modello funzionante: `ad_campaigns`,
`ad_creatives`, `ad_metrics`, `zernio_ad_accounts`, obiettivi, budget e targeting. **Lo schema
sotto ricalca quello che esiste**, perché è già stato validato contro le API reali.

## Niente `ad_sets`: un livello solo, e la via d'uscita è già pronta

Meta nativamente è `campaign → ad set → ad`, con budget e targeting sull'**ad set**. Zernio
espone un livello solo, con `placements` accanto al targeting (`zernio-ads.ts:274`). **Seguiamo
Zernio**, e la tabella `ad_sets` non si fa. Tre ragioni, in ordine:

1. **Non potremmo usarla.** Il transport è Zernio, e Zernio non espone gli ad set. Una tabella
   `ad_sets` in mezzo sarebbe una gerarchia che il nostro unico canale di pubblicazione non sa
   trasmettere: righe che non arrivano a Meta. Prima serve che Zernio lo supporti, poi la tabella.
2. **È esattamente l'astrazione difensiva che il CLAUDE.md vieta**: *«un'interfaccia con una sola
   implementazione, un livello che esiste per simmetria… complessità pagata oggi per un'eventualità
   che non arriva mai»*. La domanda giusta è *serve adesso?* — e con una campagna = un pubblico =
   un budget, no.
3. **Il prodotto è "canvas → post → campagna", non un gestore di ads.** Chi ha bisogno di due
   pubblici con budget separati sotto lo stesso obiettivo sta facendo media buying serio, e lo fa
   in Ads Manager. Qui si sponsorizza quello che ha funzionato.

**E se servisse davvero, la via d'uscita costa poco** — proprio perché oggi non c'è nulla da
disfare. Due campagne con lo stesso obiettivo e due pubblici sono già esprimibili: basta crearne
due. Per raggrupparle a posteriori è sufficiente una colonna, non una ristrutturazione:

```
parent_campaign_id  uuid references ad_campaigns(id) on delete set null
```

Un campo nullable su una tabella esistente, senza backfill e senza toccare le righe che ci sono.
È questo che rende la scelta reversibile: rimandare non costruisce debito.

⚠️ **Va però detto all'utente**, non nascosto: se l'interfaccia lascia credere che una campagna
possa avere più pubblici con budget distinti, la promessa la rompe Meta, non noi.

## ad_accounts

Separato da `social_accounts`: si connette con un OAuth diverso — il prodotto ha già due porte,
`getConnectUrl` e `getAdsConnectUrl`.

```
id                    uuid pk
org_id                uuid not null references orgs(id) on delete cascade
brand_id              uuid not null references brands(id) on delete cascade
platform              text not null default 'meta' check (platform in ('meta'))
external_account_id   text not null    -- act_<id> lato Meta
name                  text
currency              text not null
timezone              text
zernio_ad_account_id  text not null
status                text not null default 'connected'
                      check (status in ('connected','expired','revoked'))
created_at
updated_at

unique (brand_id, platform, external_account_id)
```

**`currency` sull'account, non sulla campagna**: il budget lo decide la piattaforma, e un importo
senza valuta è un numero che non vuol dire niente quando confronti due campagne.

⚠️ **Meta vuole una Pagina Facebook per ogni annuncio**, anche per quelli che escono solo su
Instagram. Serve il `page_id` (e l'`instagram_actor_id` per gli annunci IG): senza, la creazione
dell'annuncio viene rifiutata. Il prodotto ha già `getFacebookPages`/`selectFacebookPage`, quindi
il dato c'è — va solo collegato qui:

```
facebook_page_id      text
instagram_actor_id    text
```

## ad_campaigns

```
id                  uuid pk
org_id              uuid not null references orgs(id) on delete cascade
brand_id            uuid not null references brands(id) on delete cascade
ad_account_id       uuid not null references ad_accounts(id) on delete cascade
project_id          uuid references projects(id) on delete set null

name                text not null
objective           text not null
                    check (objective in ('awareness','traffic','engagement','video_views',
                                         'lead_generation','conversions','app_promotion',
                                         'catalog_sales'))
budget_amount       numeric not null
budget_type         text not null check (budget_type in ('daily','lifetime'))
starts_at           timestamptz
ends_at             timestamptz
targeting           jsonb            -- età, generi, paesi, lingue, interessi
placements          jsonb            -- feed, stories, reels, … (Meta: automatic o manuali)

status              text not null default 'draft'
                    check (status in ('draft','pending_review','scheduled','active',
                                      'paused','completed','failed','rejected'))
external_campaign_id text
zernio_campaign_id   text
error                text

created_by          uuid references profiles(id)
actor_kind          text not null default 'user'
approved_by         uuid references profiles(id)
approved_at         timestamptz
created_at
updated_at
```

`objective` e `targeting` sono presi dai tipi che il prodotto già usa (`AdGoal`, `AdTargeting`).
Il targeting resta `jsonb`: ogni piattaforma ha campi suoi, e Meta ne aggiunge di nuovi più spesso
di quanto si faccia una migrazione.

⚠️ **`approved_by` non è burocrazia.** Una campagna spende soldi veri, e con gli agenti che possono
crearla (`actor_kind = 'agent'`) serve un punto in cui una persona dice sì. Senza, un agente che
sbaglia un ordine di grandezza sul budget lo scopre la carta di credito.

**`status: 'rejected'`** esiste perché Meta rifiuta le creatività, e va distinto da `failed` (che
è un nostro errore tecnico): la risposta da dare all'utente è diversa.

## ad_creatives

Il ponte fra il contenuto e la campagna.

```
id                  uuid pk
org_id              uuid not null references orgs(id) on delete cascade
campaign_id         uuid not null references ad_campaigns(id) on delete cascade
post_id             uuid references posts(id) on delete set null
scheduled_post_id   uuid references scheduled_posts(id) on delete set null  -- boost di un organico

headline            text
primary_text        text
description         text
call_to_action      text             -- SHOP_NOW | LEARN_MORE | SIGN_UP | …
destination_url     text
media               jsonb            -- [{ asset_id, order }]

variant_of          uuid references ad_creatives(id) on delete cascade      -- A/B
status              text not null default 'draft'
                    check (status in ('draft','active','paused','rejected'))
external_creative_id text
rejection_reason     text
created_at
updated_at
```

**Due origini, e servono entrambe:**
- `post_id` → una creatività costruita da un post (una *dark post*, che non esce sul profilo).
- `scheduled_post_id` → il **boost** di un organico che sta già girando bene. Il prodotto ha già
  questa logica: `rankBoostCandidates`, `proposeBoosts`, `recommendBoostBudget`.

`variant_of` regge l'A/B testing senza una tabella in più: le varianti sono creatività che
puntano alla stessa madre.

## ad_metrics

```
id              uuid pk
org_id          uuid not null references orgs(id) on delete cascade
campaign_id     uuid not null references ad_campaigns(id) on delete cascade
creative_id     uuid references ad_creatives(id) on delete cascade
date            date not null
impressions     bigint
clicks          bigint
spend           numeric
conversions     bigint
ctr             numeric
cpc             numeric
cpm             numeric
fetched_at      timestamptz not null

unique (campaign_id, creative_id, date)
```

Granularità **giornaliera** e per creatività: è l'unica che risponde a "quale variante costa meno
per conversione". `spend` è la colonna da cui nasce ogni allarme di budget.

## competitor_ads

**Tabella separata, deciso.** Sono materiale di ricerca: si guardano, non si pubblicano. Nella
stessa tabella delle campagne sarebbero righe senza budget, senza account e senza stato, cioè
un'eccezione da spiegare in ogni query.

Alimentata dal nodo `ads` sulla tela, che interroga la libreria pubblica di Meta.

```
id                  uuid pk
org_id              uuid not null references orgs(id) on delete cascade
brand_id            uuid references brands(id) on delete set null
node_id             uuid references nodes(id) on delete set null   -- il nodo che l'ha portata

platform            text not null default 'meta' check (platform in ('meta'))
external_ad_id      text not null          -- Meta Ad Library ID
page_id             text
page_name           text
country             text not null
found_via           text check (found_via in ('page','search'))   -- come ci siamo arrivati
matched_terms       text                   -- found_via='search': cosa lo ha pescato

creative_body       text
creative_title      text
media               jsonb                  -- [{ url, type }] — URL di Meta, non nostri assets
landing_url         text
cta                 text

first_seen_at       timestamptz            -- Meta li espone: dicono da quanto gira
last_seen_at        timestamptz
is_active           boolean
raw                 jsonb                  -- la risposta intera, per non perdere campi nuovi

fetched_at          timestamptz not null
created_at

unique (org_id, platform, external_ad_id)
```

**`first_seen_at` / `last_seen_at` sono il dato che vale.** Un annuncio che gira da tre mesi sta
funzionando: è il segnale che rende utile guardare le ads altrui, molto più della creatività in sé.

**`media` punta agli URL di Meta**, non ad `assets`: scaricare creatività altrui nella propria
libreria è un problema di copyright, non solo di spazio. Se una serve come riferimento, la si
importa con un gesto esplicito.

**`raw jsonb`** perché la Ad Library cambia forma senza avvisare, e una colonna mancante è meglio
di un dato perso.

## Cosa serve intorno, che non è una tabella

- **Un worker per le consegne.** `scheduled_posts` con `status='scheduled' and scheduled_at <=
  now()`, preso con lock atomico, con backoff su `attempts`. Un indice su `(status, scheduled_at)`
  lo rende una query sola.
- **Un worker per le metriche.** Organiche e ads, a cadenze diverse: le ads valgono di più (ci sono
  soldi) e cambiano più in fretta.
- **La riconciliazione dello stato.** Una campagna può essere messa in pausa *dentro* Meta, e il
  nostro `status` mentirebbe. Serve una risincronizzazione periodica, non solo la scrittura.

## Domande aperte su publishing e ads

15. La promozione nodo → post: automatica da un `social_post_mockup`, o sempre un gesto esplicito?
16. Un post può appartenere a più progetti, o è di uno solo?
17. Approvazione: obbligatoria per ogni campagna, o solo sopra una soglia di budget / solo se
    `actor_kind = 'agent'`?
18. ~~Tabella separata per le ads dei competitor?~~ **Deciso: sì, `competitor_ads`.**
19. ~~Google Ads?~~ **Deciso: solo Meta.** La colonna `platform` resta con un check a un valore,
    così la seconda piattaforma è una riga di migrazione e non una ristrutturazione.
20. ~~Serve il livello `ad_sets`?~~ **Deciso: no, non adesso.** Vedi sotto il perché.
21. ~~Il nodo `ads` cerca per pagina o per parola chiave?~~ **Deciso: sceglie l'utente**, entrambe
    le modalità. Vedi il nodo `ads`.

---

# Chat, agenti e registro delle chiamate AI

Tre tabelle che rispondono a tre domande diverse, e tenerle separate è il punto: *cosa ci siamo
detti*, *cosa è stato fatto*, *quanto è costato*.

## chat_threads

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
project_id    uuid references projects(id) on delete cascade
canvas_id     uuid references canvases(id) on delete set null
brand_id      uuid references brands(id) on delete set null
title         text
surface       text not null default 'sidebar'
              check (surface in ('sidebar','mcp','cli'))
created_by    uuid references profiles(id)
last_message_at timestamptz
created_at
updated_at
```

`surface` dice **da dove** si sta parlando: la chat in sidebar, un agente via MCP, il terminale.
Lo stesso schema regge le tre, e una conversazione MCP è una conversazione — non un caso speciale.

## chat_messages

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
thread_id     uuid not null references chat_threads(id) on delete cascade
role          text not null check (role in ('user','assistant','tool','system'))

content       text
tool_calls    jsonb            -- [{ id, name, args }]
tool_call_id  text             -- role='tool': a quale chiamata risponde
attachments   jsonb            -- [{ asset_id }]

actor_kind    text not null default 'user'
actor_id      uuid references profiles(id)
agent_key     text

ai_call_id    uuid references ai_calls(id) on delete set null   -- il costo di QUESTO messaggio
seq           bigint not null                                   -- ordine dentro il thread
created_at

unique (thread_id, seq)
```

**`seq` e non solo `created_at`:** due messaggi nello stesso millisecondo esistono, e l'ordine di
una conversazione non può dipendere dalla precisione dell'orologio.

**`ai_call_id`** è il legame che rende la chat leggibile in termini di soldi: aprendo un thread si
sa quanto è costato, messaggio per messaggio.

## ai_calls — il registro di ogni chiamata a pagamento

Il prodotto ha già questa tabella e `logAiCall` (`src/lib/server/ai-log.ts`): provider, modello,
costo, errore, brand, utente. Lo schema sotto la riprende **aggiungendo i token**, che oggi non ci
sono e che sono l'unico modo per capire *perché* una chiamata è costata così.

```
id                  uuid pk
org_id              uuid not null references orgs(id) on delete cascade
brand_id            uuid references brands(id) on delete set null
project_id          uuid references projects(id) on delete set null

provider            text not null    -- 'openrouter' | 'zernio' | 'scrapecreators' | 'internal' …
model               text             -- 'anthropic/claude-…' — l'id ESATTO che ha risposto
operation           text not null    -- 'chat' | 'image' | 'video' | 'embedding' | 'fetch'

prompt_tokens       int
completion_tokens   int
reasoning_tokens    int              -- i modelli che ragionano li fatturano a parte
cached_tokens       int              -- letti dalla cache: costano meno, e vanno distinti
total_tokens        int

cost_usd            numeric(12,6)    -- quello che ci è costato
provider_credits    numeric          -- se il provider ragiona a crediti
billed_credits      numeric          -- quello che abbiamo addebitato all'utente

status              text not null check (status in ('ok','error','timeout','refused'))
error               text
latency_ms          int

-- chi l'ha causata
actor_kind          text not null default 'user'
actor_id            uuid references profiles(id)
agent_key           text

-- a cosa si riferisce: sempre al massimo uno di questi
node_id             uuid references nodes(id) on delete set null
node_run_id         uuid references node_runs(id) on delete set null
thread_id           uuid references chat_threads(id) on delete set null
post_id             uuid references posts(id) on delete set null

request_id          text             -- l'id lato provider, per aprire un ticket
created_at          timestamptz not null default now()
```

**Perché i token separati e non solo il costo.** OpenRouter fattura input e output a prezzi
diversi, il reasoning a parte, e la cache a uno sconto. Con il solo `cost_usd` si sa *che* una
cosa è cara ma mai *dove*: un prompt di sistema gigante ripetuto a ogni turno e una risposta lunga
danno lo stesso numero e richiedono due rimedi opposti. `cached_tokens` in particolare è quello
che dice se il prompt caching sta funzionando — senza, si paga una cache che non si sa se esiste.

⚠️ **`model` deve essere il modello che ha *risposto*, non quello richiesto.** OpenRouter fa
fallback su un altro provider quando il primo è saturo: registrare la richiesta invece della
risposta fa mentire ogni analisi di costo. È un difetto già pagato nel prodotto vecchio
(`gemini-transport.test.ts`, `family-wireid-gateway`).

**`status: 'refused'`** separato da `'error'`: un rifiuto del modello è un fatto di prodotto (il
prompt va cambiato), un errore è un fatto tecnico (si riprova). Confonderli significa riprovare
all'infinito una richiesta che non passerà mai.

**Indici:**
```sql
create index on ai_calls (org_id, created_at desc);   -- "quanto abbiamo speso questo mese"
create index on ai_calls (thread_id);
create index on ai_calls (node_run_id);
create index on ai_calls (status) where status <> 'ok';   -- parziale: gli errori sono pochi
```

⚠️ **Questa tabella cresce più di tutte le altre messe insieme.** Una retention (90 giorni di
righe intere, poi un aggregato giornaliero per org) va decisa prima che diventi il problema —
non dopo.

## api_keys — perché un agente possa scrivere

```
id            uuid pk
org_id        uuid not null references orgs(id) on delete cascade
user_id       uuid not null references profiles(id) on delete cascade
name          text not null          -- 'Claude Desktop', 'CI'
key_hash      text not null unique   -- solo l'hash, mai la chiave
key_prefix    text not null          -- 'dz_live_a1b2' — per riconoscerla nell'elenco
scopes        text[] not null default '{read,write}'
last_used_at  timestamptz
expires_at    timestamptz
revoked_at    timestamptz
created_at
```

**`user_id` obbligatorio** è ciò che rende vera la regola di sopra: ogni chiave appartiene a una
persona, quindi ogni azione di un agente ha un `actor_id` anche quando `actor_kind = 'agent'`.

⚠️ **Solo l'hash.** Il prodotto ha già imparato questa lezione due volte: `redact.test.ts` verifica
32 forme di segreto che non devono comparire nei log, e la chiave in chiaro nel database finisce
nei backup. `key_prefix` serve solo a far riconoscere all'utente quale chiave sta revocando.

---

# Fatturazione

**Il gap.** Le 26 tabelle non hanno NIENTE di fatturazione: zero colonne `plan`, `stripe`,
`subscription`, `quota`. `credits.ts` è già stato riscritto per il nuovo schema e la quota è
`creditQuota(null)` fissa per tutti — **ogni cliente pagante è oggi limitato alla quota free
(400 crediti)**, perché non c'è una colonna da cui leggere quella vera. Non è un difetto di tipi:
è un limite di fatturato finché non si chiude questa sezione.

**Il tenant è l'org**, quindi il pagamento appartiene all'org — non al brand, come nel prodotto
vecchio.

## Il modello di prezzo: a consumo, con un margine minimo che non si tocca mai

Il prodotto vende **crediti a consumo**, non funzionalità a livelli.

- **Abbonamento e acquisto una tantum, sugli stessi punti di prezzo, a due cambi diversi**:
  abbonamento 100 crediti/$1 di prezzo (alla tariffa piatta), una tantum 70 crediti/$1 — comprare
  senza impegno costa di più al cliente, e per questo rende di più a noi.
- **Ogni chiamata AI porta un margine minimo del 50%.** Non un "markup del 20%" — la primissima
  stesura di questa sezione lo era, ed è stato un errore di leva: un margine è sul RICAVO
  (`(prezzo−costo)/prezzo`), un markup è sul COSTO (`(prezzo−costo)/costo`). Un markup del 20% dà
  solo il 16,7% di margine reale, e uno sconto a scala sopra quel numero andava sotto zero proprio
  sui clienti più grandi — la promessa "non ci rimettiamo mai" si sarebbe rotta esattamente lì. Il
  markup che dà davvero il 50% di margine è **100%: 200 crediti ogni $1 di costo provider.**
- **Non si perde mai, su nessun gradino, nel caso peggiore** — il cliente spende ogni credito
  comprato. Mai un margine che conta su crediti non spesi (breakage): un modello che ha bisogno di
  breakage per essere in utile è un modello che scommette, non che fattura.

⚠️ **Questa sezione ha attraversato quattro stesure**: tier a funzionalità → cambio unico senza
scadenza → markup del 20% (leva sbagliata) → questa. Ogni giro ha corretto SOLO l'errore del
precedente, tenendo ferme le decisioni già prese — scadenza, ordine di spesa,
`billed_credits` scritto in scrittura.

## L'aritmetica: margine ≠ markup, ed è quello che ha prodotto l'errore

Con `billed_credits = cost_usd × 100 × (1+markup)`:

```
margine = markup / (1 + markup)

markup  20% → margine 16,7%
markup 100% → margine 50,0%   ← quello scelto: $5 di crediti costano $2,50 di spesa provider
```

Un credito venduto costa `1 / (100 × (1+markup)) = 1/200` dollari da onorare. Il margine di un
gradino che vende `credits` crediti a `price` dollari è quindi:

```
margine(prezzo, crediti) = 1 − (crediti / (prezzo × 200))
```

Ogni credito venduto SOPRA la tariffa piatta (100 crediti/$1 abbonamento) è margine speso
deliberatamente — mai un errore di arrotondamento, mai un caso limite non controllato.

## La scala: piatta fino a $50, sconto solo da $100 in su

```
prezzo   cr abbonamento   cr una tantum   costo max   margine sub   margine 1x   bonus vs. tariffa piatta
$5              500            350          $2,50         50%          65%              —
$15           1.500          1.050          $7,50         50%          65%              —
$30           3.000          2.100         $15,00         50%          65%              —
$50           5.000          3.500         $25,00         50%          65%              —
$100         11.200          7.840         $56,00         44%          61%             12%
$200         24.000         16.800        $120,00         40%          58%             20%
$400         52.000         36.400        $260,00         35%          55%             30%
```

**Perché questa forma, e non una curva continua** (le due stesure precedenti ne proponevano una,
lineare o degressiva su ogni gradino): **i primi quattro gradini sono un'unica tariffa piatta**
(100 crediti/$1 abbonamento, 70 crediti/$1 una tantum), senza aritmetica da spiegare — un cliente
fa il conto a mente, e non c'è un bonus parziale da giustificare su un pacchetto piccolo. Lo sconto
comincia esattamente dove un acquisto è abbastanza grande perché lo sconto significhi qualcosa, e
ogni punto di margine speso da lì in su è deliberato, non deriva.

**Margine medio pesato sul prezzo: 39%** — dentro la fascia 30-40% chiesta, con il floor toccato
**esattamente** sul gradino più alto ($400 → 35%), mai sceso sotto per nessun gradino, in nessuna
colonna. **Costo max** è il caso peggiore: il cliente spende ogni credito comprato — nessuna ipotesi
di crediti mai spesi, quelli sono margine IN PIÙ, mai una condizione per essere in utile.

**La colonna una tantum non ha bisogno di un proprio floor**: a parità di prezzo vende meno crediti
(70:1 contro 100:1), quindi costa sempre meno da onorare — il suo margine è sempre più alto di
quello dell'abbonamento sullo stesso gradino, per costruzione, non da verificare riga per riga.

⚠️ **Questa tabella non è schema — vive in codice**, come `PLANS` oggi. Lo schema non sa quanti
gradini esistono: legge `stripe_price_id → credits` dall'evento Stripe (abbonamento) o
`metadata.credits` scritto dal nostro codice al checkout (una tantum). **Cambiare la scala —
aggiungere un gradino sotto $5 o sopra $400, alzare un bonus — è editare la lista in codice, mai
una migrazione, ma editarla senza far girare il test sotto è esattamente come un gradino torna
sotto il floor senza che nessuno se ne accorga finché non arriva la fattura.**

## Il guard: un test che cammina la scala, non un commento

**Il floor deve essere una proprietà del sistema, non un'intenzione scritta qui.** Un test che
cammina OGNI gradino, in ENTRAMBE le colonne, calcola il margine al markup configurato nel caso
peggiore, e fallisce sotto il floor — è il punto centrale di questo esercizio: è quello che rende
"non ci rimettiamo mai" una proprietà del sistema, non una frase in un documento.

```ts
// src/lib/server/credit-ladder.test.ts
import { describe, it, expect } from 'vitest';
import { CREDIT_LADDER, MARGIN_FLOOR, marginForRung } from './credit-ladder';

describe('credit ladder never falls below the margin floor', () => {
  for (const rung of CREDIT_LADDER) {
    it(`$${rung.price} subscription clears the floor in the worst case`, () => {
      // Caso peggiore: il cliente spende OGNI credito comprato. Nessuna ipotesi di breakage.
      expect(marginForRung(rung.price, rung.creditsSubscription)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    });
    it(`$${rung.price} one-time clears the floor in the worst case`, () => {
      expect(marginForRung(rung.price, rung.creditsOneTime)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    });
  }
});
```

`marginForRung` è la STESSA formula usata per costruire la tabella sopra — mai una seconda
implementazione che potrebbe disallinearsi dalla prima. Un futuro editor della scala lo scopre in
CI, non in una fattura di fine mese: **la scala non è libera di essere modificata "a occhio".**

## `credit_ledger`: grant e debiti come righe, saldo = somma — con un ordine di spesa, non solo un totale

```
## credit_ledger

id              uuid pk
org_id          uuid not null references orgs(id) on delete cascade
kind            text not null check (kind in ('grant','debit'))
source          text not null
                check (source in ('subscription_renewal','one_time_purchase','promo',
                                   'manual','refund','ai_usage'))
amount          integer not null check (amount > 0)   -- crediti; `kind` dice il segno
note            text
created_by      uuid references profiles(id)          -- null per system/stripe

stripe_event_id       text     -- idempotenza (vedi sotto) e tracciabilità
stripe_checkout_id    text     -- acquisto una tantum: la sessione che ha pagato
stripe_invoice_id     text     -- rinnovo abbonamento: la fattura che l'ha coperto
ai_call_id            uuid references ai_calls(id) on delete set null  -- kind='debit', source='ai_usage'

-- null = non scade mai. Valorizzato = scade — vedi "Scadenza" sotto.
expires_at      timestamptz

created_at      timestamptz not null default now()

unique (stripe_event_id)   -- l'idempotenza, vedi "Idempotenza"
```

**`kind` + `amount` sempre positivo, non un `amount` con segno**: un debito negativo sommato a un
grant positivo è un dettaglio implementativo che si può sbagliare; `kind` esplicito si legge da
solo in un audit. **`source` è la tabella delle eccezioni che CLAUDE.md chiede**: ogni riga porta il
PERCHÉ in una colonna sola, mai dedotto da quali FK sono valorizzate.

## Scadenza: decisa

**`source='subscription_renewal'` → `expires_at` = fine del periodo a cui appartiene.
`source='one_time_purchase'` → `expires_at = null`, permanente finché non è speso.** Scritta dal
trigger di rinnovo e da quello di acquisto (vedi "Stripe" sotto). `promo`/`manual` restano a
discrezione di chi scrive la riga.

⚠️ **Sovrapposizione di rinnovi a cavallo del cambio periodo**: se il grant del periodo precedente
non è ancora scaduto nel momento esatto del rinnovo, per una finestra breve l'org ha due grant
abbonamento vivi insieme — non impedito esplicitamente, un margine di minuti di crediti "in più",
non un accumulo perenne. Se il prodotto vuole azzerarlo al centesimo, il trigger di rinnovo può
marcare `expires_at = now()` sul grant precedente non ancora scaduto: non aggiunto di default, è
una scelta di severità commerciale, non un difetto tecnico.

## L'ordine di spesa: le scadenti PRIMA — e perché il debito torna a essere una riga per chiamata

**Con la scadenza vera, l'ordine di consumo è un fatto di soldi, non un dettaglio.** Se un'org ha
1.000 crediti da abbonamento che scadono fra 3 giorni e 5.000 da un pacchetto permanente, e spende
200 oggi, quei 200 DEVONO uscire dai 1.000 in scadenza — altrimenti scadono inutilizzati mentre il
permanente si consuma al posto loro, e il cliente è derubato in silenzio: nessun errore, nessun
log, solo un saldo finale più basso di quanto si aspetti.

Con un saldo calcolato dal vivo su `ai_calls` (l'ibrido di una stesura precedente) non c'è un modo
pulito di sapere quale grant sta consumando quale dollaro. **Il debito torna quindi a essere una
riga per chiamata nel `credit_ledger`** — e con `billed_credits` scritto al momento della chiamata
(vedi sotto), quella riga è comunque necessaria per fatturare bene: non è lavoro aggiunto per
niente.

```sql
create or replace function public.org_credit_balance(_org_id uuid) returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'grant' then amount else -amount end), 0)::integer
  from public.credit_ledger
  where org_id = _org_id
    and (expires_at is null or expires_at > now());
$$;
```

**Il saldo resta la somma di tutte le righe non scadute** — una query, nessun ordine da calcolare
per rispondere "quanto ho". **Il debito NON si spacchetta per grant consumato**: complicherebbe la
scrittura (un lock sui grant dell'org per calcolare quanto resta di ciascuno) per un beneficio che
il saldo non richiede — è già corretto con un debito unico, cieco all'ordine per definizione.
**Quello che serve l'ordine è una domanda diversa: "quanto sta per scadere invaso?"**, e risponde
una vista FIFO sui grant che scadono prima, separata dal saldo:

```sql
create or replace view public.org_credits_at_risk as
with grants as (
  select org_id, id, amount, expires_at,
         sum(amount) over (partition by org_id order by expires_at nulls last, created_at) as running_total
  from public.credit_ledger
  where kind = 'grant' and (expires_at is null or expires_at > now())
),
spent as (
  select org_id, coalesce(sum(amount), 0) as total_spent
  from public.credit_ledger where kind = 'debit' group by org_id
)
select g.org_id, g.expires_at,
       greatest(0, least(g.amount, g.running_total - coalesce(s.total_spent, 0))) as at_risk
from grants g
left join spent s on s.org_id = g.org_id
where g.expires_at is not null and g.running_total > coalesce(s.total_spent, 0);
```

Questa vista alimenta l'email di avviso ("hai 340 crediti che scadono fra 3 giorni") — **non il
gate di spesa**, che continua a leggere solo `org_credit_balance`. L'ordine di consumo (le scadenti
prima) è implicito nel modo in cui si CALCOLA quanto è a rischio (FIFO per scadenza), non in come si
scrivono i debiti (un debito solo, cieco all'ordine): la stessa separazione fra "quanto ho" e "cosa
sto per perdere" che un estratto conto fa con un fido in scadenza.

**Test che fissa il comportamento** (rosso prima, poi verde): org con un grant abbonamento da 1.000
in scadenza fra 1 giorno, un grant pacchetto da 5.000 permanente, 200 di spesa registrata —
`org_credits_at_risk` deve rispondere `at_risk = 800` (1.000 − 200: la spesa intacca prima lo
scadente), mai `1.000` (la spesa avrebbe intaccato il permanente) né `0` (falso allarme).

## Il debito reale: `billed_credits`, scritto UNA VOLTA, in scrittura — non ricalcolato al bisogno

**`ai_calls` ha già due colonne per questo, tenute separate ad alta voce:**

```
cost_usd            numeric(12,6)    -- quello che il PROVIDER ci ha fatturato. MAI marcato su.
billed_credits      numeric          -- quello che ADDEBITIAMO all'utente. cost_usd × 200.
```

Mischiarle rende il margine incalcolabile e un rimborso incalcolabile (un rimborso si emette sul
CREDITO addebitato, non sul costo — l'utente non deve sapere cosa costa a noi una chiamata).
`cost_usd` **resta grezzo**, sempre.

**Il markup si applica in SCRITTURA, non in lettura.** Se vivesse in lettura, cambiare la costante
cambierebbe silenziosamente quanto un cliente risulta aver speso per chiamate GIÀ fatte — il suo
storico si riscriverebbe sotto di lui. Con la scrittura, `billed_credits` è congelato per chiamata:
un cambio di markup vale solo per le chiamate future. È la stessa ragione per cui `ai_calls.model`
deve essere il modello che ha *risposto* e non quello richiesto — un fatto, non una policy
rileggibile diversamente domani — già scritta altrove in questo documento per un'altra colonna
della stessa tabella.

```ts
// src/lib/server/credit-ladder.ts — UN posto, vicino ai gradini, non un terzo in ai-log.ts o
// plan-budget.ts. Verificato: né l'uno né l'altro hanno oggi una costante di margine sull'utente —
// il commento "il markup" in ai-log.ts parla del prezzo del gateway LLM (il provider a monte), un
// concetto diverso che non va toccato; PRODUCTION_MARGIN in plan-budget.ts è un terzo concetto
// ancora (quanto di un abbonamento va in produzione contenuti). Le tre costanti coesistono, nessuna
// sostituisce le altre.
export const AI_MARKUP = 1.00;                       // 100% — $5 di crediti costano $2,50 di spesa
                                                       // provider (margine 50% alla tariffa piatta)
export const MARGIN_FLOOR = 0.35;                     // nessun gradino scende sotto — pinnato dal test

export const CREDITS_PER_USD_SUBSCRIPTION_LIST = 100 * (1 + AI_MARKUP); // 200: cambio costo→credito

export const CREDIT_LADDER = [
  { price: 5,   creditsSubscription: 500,    creditsOneTime: 350   },
  { price: 15,  creditsSubscription: 1_500,  creditsOneTime: 1_050 },
  { price: 30,  creditsSubscription: 3_000,  creditsOneTime: 2_100 },
  { price: 50,  creditsSubscription: 5_000,  creditsOneTime: 3_500 },
  { price: 100, creditsSubscription: 11_200, creditsOneTime: 7_840 },
  { price: 200, creditsSubscription: 24_000, creditsOneTime: 16_800 },
  { price: 400, creditsSubscription: 52_000, creditsOneTime: 36_400 }
] as const;

export function billedCreditsFor(costUsd: number): number {
  return Math.round(costUsd * CREDITS_PER_USD_SUBSCRIPTION_LIST);
}

export function marginForRung(price: number, credits: number): number {
  const cost = credits / CREDITS_PER_USD_SUBSCRIPTION_LIST;
  return (price - cost) / price;
}
```

⚠️ **`CREDITS_PER_USD_SUBSCRIPTION_LIST` calcola SOLO il debito di una chiamata AI**, sempre allo
stesso cambio, a prescindere da come l'org ha comprato i suoi crediti — il cambio 70:1 vale SOLO
all'ACQUISTO (quanti crediti dà un pacchetto da $X), mai alla SPESA (quanti crediti costa una
chiamata): un credito, una volta nel saldo, vale uguale a prescindere da dove viene. Non c'è
un'IA più cara per chi ha comprato un pacchetto invece di abbonarsi.

**`billed_credits` null sulle righe storiche.** Ogni riga scritta prima di questa migrazione ha
`billed_credits = null` — `logAiCall` oggi non la valorizza mai (verificato: solo `cost_usd` e
`provider_credits` finiscono nella INSERT). Il fallback per chi legge lo storico:
`coalesce(billed_credits, round(cost_usd * 200))` — usato solo per report/audit su dati vecchi, MAI
per il saldo vivo (che legge solo `credit_ledger`, dove il debito è già scritto al momento della
chiamata). **Nessun backfill in questa migrazione**: valorizzare `billed_credits` su ogni riga
storica è un'operazione separata, esplicitamente fuori scope — tocca centinaia di migliaia di
righe e non cambia nulla di operativo oggi.

## Cosa costa il piano gratuito

`FREE_CREDITS = 400` in `plans.ts`, allo stesso cambio 200:1: **costa esattamente $2,00 di spesa
provider per org, ogni mese che l'org resta attiva sul free.** Sta appena SOTTO il gradino
d'ingresso ($5 → 500 crediti abbonamento): il free è un assaggio, strettamente meno del più piccolo
acquisto possibile — una relazione più pulita delle stesure precedenti, dove il free coincideva
esattamente con l'ingresso a pagamento. **Vale la pena dichiararlo deliberato nel copy**, non
lasciarlo come un numero senza commento: 400 non è "quasi 500", è scelto per restare sotto.

## Stripe: due forme di prodotto, due cambi, un solo meccanismo di sync

**Abbonamento**: uno `stripe.subscriptions` (FDW) per rung, letto dal trigger
`sync_org_from_stripe_subscription`. Scrive un grant nel ledger a ogni rinnovo, con `expires_at` =
fine del prossimo periodo e `stripe_event_id = 'sub:' || subscription.id || ':' || period_start` —
un rinnovo per periodo, un grant per rinnovo, mai duplicato (vedi "Idempotenza").

**Acquisto una tantum**: `stripe.checkout_sessions`, altro oggetto dello stesso Wrapper — nessun
secondo meccanismo. Una Checkout Session `mode='payment'` completata; il trigger legge
`metadata.credits` (scritto dal nostro codice al checkout, già calcolato al cambio 70:1 sulla
scala sopra) e scrive un grant con `expires_at = null`.

## Idempotenza: il vincolo `unique`, non la logica applicativa

**`unique(stripe_event_id)` + `on conflict do nothing`** su ogni insert nel `credit_ledger`, sia
per il rinnovo sia per l'acquisto. Stripe consegna gli eventi *at-least-once*, il FDW può
risincronizzare la stessa riga più volte — un grant scritto due volte per lo stesso evento è
credito regalato, non un errore innocuo. Il vincolo è sulla tabella: strutturalmente impossibile
inserire la stessa riga due volte, non solo improbabile.

## Quota abbonamento e override enterprise

L'override enterprise resta **un grant manuale nel ledger** (`source='manual'`), non una colonna su
`orgs`. Con `expires_at` un concetto vivo, un override permanente porta `expires_at = null`
(comportamento identico a un pacchetto una tantum), uno a termine lo valorizza.

## Il piano free e il cancello

Il trigger di rinnovo non scrive più un nuovo grant quando l'abbonamento risulta
`canceled`/`unpaid`/`incomplete_expired`, e il grant del periodo corrente scade comunque da solo
alla data che già porta — non serve un azzeramento esplicito alla cancellazione. Un pacchetto una
tantum ancora vivo continua a essere spendibile anche a abbonamento scaduto: conseguenza diretta
di tenere le due fonti separate, e il comportamento che mi sembra giusto (l'utente ha pagato per
quel credito specifico, non per l'abbonamento).

`gateCredits`/`gateOrgCredits` restano il cancello, la fonte della verità è `org_credit_balance`.
Fail-CHIUSO su un errore di lettura resta com'era.

## Cosa resta aperto

**Chiuse da questo giro (decisioni dell'utente, non più `?`):**
- Scadenza abbonamento sì, una tantum no.
- Cambio 100:1 abbonamento / 70:1 una tantum.
- **Margine 50% sui primi quattro gradini (tariffa piatta), sconto solo da $100 in su, floor al
  35% mai sceso — implementato con la scala fissa e il test che la cammina.**
- Ordine di spesa (le scadenti prima) — risolto con un debito unico per chiamata più una vista FIFO
  separata per "cosa è a rischio".
- Debito per-chiamata nel ledger — non più un `?`, necessario per l'ordine di spesa.
- Collisione $4/free — risolta cambiando l'ancora a $5/500 crediti: il free (400) sta ora
  strettamente sotto il gradino d'ingresso, non più a pari merito.

**Sopravvissute:**
- **`orgs.owner_id` non esiste.** Autorità di fatturazione da ridefinire su
  `orgs_members.role='owner'`.
- **Retention di righe scadute nel ledger.** Restano per sempre, escluse dalla somma.
- **Sovrapposizione di grant da rinnovo a cavallo del cambio periodo.** Non impedita
  esplicitamente.
- **Backfill di `billed_credits` sulle righe storiche.** Fuori scope.

**Nuove:**
- **La forma "piatto fino a $50, sconto da $100" è una decisione commerciale già presa
  dall'utente**, non più una mia proposta — nessun `?` residuo sulla scala stessa.
- **Il floor al 35% è fissato**, ma resta implicito che AGGIUNGERE un gradino (sotto $5, sopra
  $400) o alzare un bonus esistente richiede di far girare di nuovo il test prima di pubblicarlo:
  non è enunciato da nessuna parte CHI ha l'autorità di cambiare la scala senza una migrazione —
  oggi chiunque tocchi il file in codice, senza un secondo controllo oltre al test stesso.

---

# Collaborazione in tempo reale

La regola che decide tutto lo schema qui sotto è una sola:

> **Quello che è effimero non tocca il database. Quello che è permanente non passa per il
> broadcast.**

Un cursore che si muove sessanta volte al secondo non è un dato: è un evento. Se finisce in una
tabella, ogni collaboratore scrive ~3.600 UPDATE al minuto, il WAL si riempie, la replica va in
ritardo e il canvas diventa *più* lento quanto più gente ci lavora — il contrario di quello che
serve. Tre canali, tre nature diverse:

| Cosa | Dove vive | Frequenza | Sopravvive al refresh? |
|---|---|---|---|
| Cursore, selezione, "sto trascinando" | **Presence** (in memoria) | ~60/s | no |
| Il nodo mentre lo trascini | **Broadcast** (nessuna persistenza) | ~60/s | no |
| Il nodo quando lo lasci | **Postgres** + Realtime `postgres_changes` | 1 per gesto | sì |

Il repo ha già i primi due pezzi: `src/lib/realtime/brand-channel.svelte.ts` e
`presence-peers.ts`, con una cosa già risolta che di solito si sbaglia — **la presence è per
persona, non per tab**: *«Someone with three tabs open is one teammate, not a crowd»*. Serve
rifarne il modello sul canvas, non l'infrastruttura.

## 1. Presence — chi c'è, dove guarda (niente tabella)

Payload del canale `canvas:<canvas_id>`, tenuto in memoria da Supabase Realtime:

```ts
{
  userId, name, avatar,
  cursor:      { x, y } | null,      // coordinate del canvas, non del viewport
  selection:   string[],             // node_id selezionati
  dragging:    string | null,        // node_id che sta muovendo adesso
  editingNode: string | null,        // node_id di cui ha il pannello aperto
  viewport:    { x, y, zoom }        // per il "porta anche me qui"
}
```

Non esiste nessuna tabella `canvas_presence`: quando il socket cade, la presenza sparisce da sola.
Una tabella richiederebbe un reaper per le righe fantasma di chi ha chiuso il portatile — e un
reaper è esattamente il genere di cosa che poi ha bisogno del suo test perché uccide run vivi.

**Throttle del cursore a ~20-30/s** lato client: sopra non si vede la differenza e il canale si
satura.

## 2. Broadcast — il movimento mentre avviene (niente tabella)

Durante un trascinamento il nodo si muove sul monitor di tutti, ma **non si scrive niente**:

```
drag:start   { nodeId }
drag:move    { nodeId, x, y }          // throttled, effimero
drag:end     { nodeId, x, y }          // → qui, e solo qui, l'UPDATE su nodes
```

Un solo `UPDATE` per gesto invece di duecento. Lo stesso vale per il ridimensionamento e per il
tracciamento di un arco.

## 3. Postgres — la verità, via `postgres_changes`

Le tabelle da pubblicare su Realtime:

```sql
alter publication supabase_realtime add table nodes;
alter publication supabase_realtime add table nodes_connections;
alter publication supabase_realtime add table canvases;

-- senza questo l'evento DELETE arriva con solo la PK, e i client non sanno che nodo togliere
alter table nodes             replica identity full;
alter table nodes_connections replica identity full;
```

⚠️ **`replica identity full` non è un dettaglio**: di default un `DELETE` pubblica solo la chiave
primaria. Con `full` arriva la riga intera, e i filtri RLS sugli eventi funzionano anche in
cancellazione.

⚠️ **La RLS vale anche sul canale.** `postgres_changes` rispetta le policy: se `org_isolation` non
c'è su `nodes`, i cambiamenti di un'altra org arrivano a chi non deve vederli. È la stessa fuga
fra tenant del prodotto vecchio, ma in diretta.

## 4. Conflitti: `version`, non "l'ultimo vince"

Due persone spostano lo stesso nodo. Senza difese, l'ultimo `UPDATE` che arriva vince e l'altro
lavoro sparisce in silenzio. Il campo `version` su `nodes` serve a questo:

```sql
update nodes
   set x = $x, y = $y, version = version + 1, updated_by = auth.uid(), updated_at = now()
 where id = $id and version = $expected_version;
-- 0 righe = qualcun altro è arrivato prima: il client rilegge e riapplica
```

**? Serve davvero ovunque, o solo dove fa male?** La mia proposta: distinguere per campo.

- **Posizione** (`x`, `y`, `z`) — *last-write-wins va bene.* Due persone che trascinano lo stesso
  nodo si contendono il mouse; l'ultima posizione è quella che entrambe vedono, e nessuno "perde"
  del lavoro.
- **Contenuto** (`data`) — *serve `version`.* Se A riscrive il prompt e B cambia il modello, un
  last-write-wins butta via una delle due modifiche senza dirlo.
- **Esistenza** (`deleted_at`) — *soft delete.* Vedi sotto.

## 5. Il testo lungo: `data` intero o CRDT?

È **la decisione aperta più importante**, perché cambia lo stack, non solo lo schema.

Un nodo `doc` o un prompt lungo scritto da due persone insieme non si risolve con `version`: a
ogni battuta uno dei due perde. Le strade:

**(a) Nessuna co-scrittura sullo stesso campo** — il `lock_by`/`lock_at` sulla tabella: chi apre
il pannello di un nodo lo prende, gli altri lo vedono in sola lettura ("Marco sta scrivendo"). Il
lock scade da solo (`lock_at < now() - 30s`), così un browser chiuso non blocca il nodo per
sempre. **Semplice, zero dipendenze, e copre il 90% dei casi di un canvas.**

**(b) CRDT (Yjs) sui campi di testo** — co-scrittura vera, carattere per carattere. Costo: una
libreria in più, un server di sincronizzazione (o `y-supabase`), e un `doc_state bytea` accanto al
testo in chiaro, perché il database deve continuare a poter leggere il contenuto per la ricerca e
per gli agenti.

Nel `package.json` oggi non c'è **nessun** CRDT. Se la co-scrittura del testo non è un requisito
del primo rilascio, **(a)** è la scelta giusta e **(b)** resta possibile dopo: si aggiunge una
colonna, non si riscrive lo schema.

## 6. Cancellazione: soft, non hard

`deleted_at timestamptz` su `nodes` e `nodes_connections` invece del `DELETE`:

- L'evento Realtime diventa un `UPDATE` normale, che porta la riga intera — nessun problema di
  replica identity.
- **L'undo di un altro collaboratore funziona.** Con un hard delete, A cancella un nodo e B che
  preme Ctrl+Z non ha niente da riportare indietro.
- Gli archi verso un nodo cancellato non svaniscono a cascata mentre qualcuno li guarda.

Serve una pulizia periodica (`delete where deleted_at < now() - interval '30 days'`) e che ogni
query di lettura filtri `deleted_at is null` — dimenticarlo è il difetto classico del soft delete,
e vale un test.

## 7. Storia e undo condiviso

```
## canvas_events

id            bigserial pk
org_id        uuid not null references orgs(id) on delete cascade
canvas_id     uuid not null references canvases(id) on delete cascade
actor_id      uuid references profiles(id)
kind          text not null      -- 'node.create' | 'node.move' | 'node.update'
                                 -- 'node.delete' | 'edge.create' | 'edge.delete'
node_id       uuid
edge_id       uuid
before        jsonb              -- serve per l'undo
after         jsonb
created_at    timestamptz not null default now()
```

`bigserial` e non uuid: l'ordine è il punto, e un intero crescente dice da solo "cosa è successo
prima". Serve a tre cose che senza non si fanno: l'**undo/redo condiviso**, il *"Marco ha spostato
3 nodi"* nell'interfaccia, e il recupero quando qualcuno cancella mezza tela.

**? Quanto tenerla.** Una riga per gesto su una tela attiva cresce in fretta: o si potano gli
eventi vecchi di N giorni, o si registrano solo i gesti strutturali (create/delete/update) e non i
movimenti.

**? Chi scrive qui.** Un trigger su `nodes` è automatico ma non sa distinguere un gesto dell'utente
da una scrittura dell'agente; dal codice è più preciso ma va ricordato a ogni `UPDATE`.

## 8bis. MCP e CLI scrivono sullo stesso canvas — e la collab vale anche per loro

Un agente esterno via MCP e un `dazero` da terminale **non sono un caso a parte**: sono altri due
scrittori sulle stesse tabelle. Questo funziona *gratis* per la propagazione — se scrivono su
Postgres, `postgres_changes` porta il cambiamento a chiunque abbia il canvas aperto — ma tre cose
vanno decise adesso, o si scoprono come difetti.

**1. Presence senza socket.** Un agente MCP non tiene un canale aperto: fa una chiamata HTTP e se
ne va. Se la presenza vive solo in Realtime, un agente che lavora per due minuti è **invisibile** —
e due persone guardano nodi che si muovono da soli. Serve che chi scrive via API annunci sé stesso
sul canale del canvas prima di toccare le righe (un `broadcast` è sufficiente, niente tabella):

```
agent:active   { actorKind: 'agent', actorLabel: 'Claude via MCP', canvasId, nodeIds }
agent:done     { … }
```

**2. Il lock vale anche per loro.** `lock_by` è nullable e punta a `profiles`: un agente non ha un
profilo. Va affiancato da `lock_actor` (vedi sotto), altrimenti un agente scrive dentro un nodo che
una persona sta modificando — e vince l'ultimo, cioè si perde lavoro umano senza accorgersene.

**3. Scritture in blocco.** Un agente che crea venti nodi fa venti `INSERT`, cioè venti eventi
realtime e venti riletture sul client di tutti. Vale la pena raggrupparle in una transazione e,
se l'interfaccia lo regge, annunciare un solo `canvas:batch` alla fine — il dettaglio non è
schema, ma è la differenza fra "sono comparsi venti nodi" e venti scatti.

## 9. Chi ha fatto cosa: `actor` ovunque, non solo `user_id`

La domanda *«chi ha modificato questo nodo»* ha oggi tre risposte possibili, e `updated_by uuid`
ne regge una sola. Serve una coppia, ripetuta identica su ogni tabella che registra un'azione:

```
actor_kind   text not null default 'user'
             check (actor_kind in ('user','agent','system'))
actor_id     uuid references profiles(id)   -- null quando non è una persona
actor_label  text                           -- 'Claude via MCP', 'dazero CLI', 'cron:publish'
agent_key    text                           -- quale agente: 'mcp:claude', 'sidebar', 'cli'
```

- **`user`** → `actor_id` valorizzato, `actor_label` nullo (il nome sta su `profiles`).
- **`agent`** → `actor_id` è **l'utente per conto del quale** l'agente agisce (un token MCP
  appartiene sempre a qualcuno: è così che si sa chi paga e chi autorizza), `agent_key` dice
  quale, `actor_label` è per l'interfaccia.
- **`system`** → entrambi nulli: cron, worker, migrazioni.

⚠️ **`actor_id` valorizzato anche per gli agenti è la scelta che conta.** Un agente non è mai
anonimo: agisce con la chiave di qualcuno, spende i suoi crediti e scrive nella sua org. Perdere
quel legame significa non poter rispondere né a *«chi ha autorizzato questo»* né a *«chi lo paga»*.
`actor_kind` distingue **come** è stato fatto; `actor_id` resta **per conto di chi**.

Questa coppia va su: `nodes`, `nodes_connections`, `canvas_events`, `posts`, `scheduled_posts`,
`ad_campaigns`, `ad_creatives`, e il `lock_by`/`lock_at` diventa `lock_actor_kind` +
`lock_actor_id` + `lock_agent_key`.

## 10. L'agente è un collaboratore come gli altri

Questo è il punto che lo schema deve reggere **e che di solito si scopre tardi**: il chatbot in
sidebar e gli agenti esterni via MCP scrivono sullo stesso canvas mentre ci sono persone dentro.

- Un agente che aggiunge un nodo deve apparire **come un cursore in più**, non come un refresh
  della pagina. Se scrive su Postgres, `postgres_changes` lo propaga gratis — è già così.
- `updated_by` deve poter dire *«l'ha fatto l'agente»*. **? Come:** un `profiles` fittizio per
  l'agente, oppure una colonna `actor_kind ('user'|'agent'|'system')` accanto a `updated_by`. La
  seconda è più onesta: un agente non è una persona con un'email.
- **Un nodo che sta generando è già uno stato condiviso.** Lo `status: 'running'` dentro `data`
  serve a tutti quelli che guardano, non solo a chi ha premuto il bottone: senza, due persone
  lanciano la stessa generazione e la pagano due volte.

## 9. Cosa il client tiene in memoria

Non è schema, ma decide se lo schema basta:

- Applicazione **ottimistica** in locale, poi riconciliazione con l'evento che torna da Postgres.
  Il proprio evento va ignorato all'arrivo (`updated_by = me` e la versione già vista), altrimenti
  il nodo "scatta" indietro sotto le dita.
- **Riconnessione**: al ritorno online si rilegge il canvas e si riapplica quello che non era
  passato. `updated_at` per canvas rende la domanda *«cosa mi sono perso?»* una query sola.
- L'ordine `z` va gestito come i movimenti: effimero mentre trascini, persistito quando lasci.

## Decisioni sulla collaborazione

**10. Testo lungo: lock per nodo, non CRDT.** Il CRDT è la risposta giusta a una domanda che qui
non si pone: due persone che scrivono *lo stesso paragrafo nello stesso momento*. Su un canvas si
lavora per nodi — uno scrive il prompt, l'altro guarda l'immagine — e il conflitto vero è raro.
Il costo invece è immediato: una libreria, un server di sincronizzazione, e un `bytea` accanto al
testo in chiaro (che serve comunque, perché database e agenti devono poter leggere il contenuto).
`lock_by`/`lock_at` con scadenza a 30s è già in tabella, e non preclude nulla: il CRDT resta una
colonna in più il giorno che serve davvero.

**11. `version` solo su `data`, posizione last-write-wins.** Due persone che trascinano lo stesso
nodo si contendono il mouse: l'ultima posizione è quella che entrambe vedono e nessuno perde
lavoro. Sul contenuto no — A riscrive il prompt, B cambia il modello, e senza `version` una delle
due modifiche sparisce in silenzio. Il conflitto va difeso dove fa male, non ovunque.

**12. `canvas_events`: la scrive il codice, si tiene 356 giorni, solo i gesti strutturali.**
- *Chi:* il codice, non un trigger. Un trigger non distingue un gesto dell'utente da una scrittura
  dell'agente né da una migrazione, e `actor_kind` è metà del valore della tabella.
- *Cosa:* create/delete/update e gli archi. **Non i movimenti** — `node.move` è il 90% degli eventi
  e il meno interessante da rileggere; la posizione sta già su `nodes`.
- *Quanto:* 356 giorni, con una pulizia periodica. È un registro operativo, non un archivio.

**13. `actor_kind`, non un profilo fittizio.** Un agente non è una persona con un'email, e un
profilo finto inquina ogni join su `profiles`, ogni elenco di membri, ogni conteggio. La colonna
dice la verità: `'user' | 'agent' | 'system'`, con `updated_by` nullo quando l'attore non è umano.

**14. Undo solo proprio.** ✅ *(deciso)*
La conseguenza tecnica è però importante: **`before` va popolato comunque, sempre.** Non per
l'undo altrui, ma perché senza non si recupera un nodo cancellato per errore — ed è il caso in cui
serve di più. L'undo è filtrato per `actor_id` nella UI; il dato resta completo.

## Decisioni sullo schema

**1. Molti canvas per progetto. `canvases` esiste.** È l'unica delle nove che se sbagliata costa
una migrazione di ogni nodo: passare da uno a molti richiede di inventare un canvas per ogni
progetto e riscrivere le righe; il contrario è gratis (se resta sempre uno, la tabella ha una riga
per progetto e non dà fastidio a nessuno). Il pitch dice *canvas infiniti*, al plurale. Nel dubbio
si sceglie la direzione che non si paga.

**2. `brand_id` sul progetto, **nullable**, con override sul post.** Il brand è un fatto stabile
del progetto — la voce, il logo, gli account — e ripeterlo su ogni post sarebbe una scelta da
rifare ogni volta. L'override sul post esiste perché il caso "questo esce sull'altro brand" è
reale. La tabella ponte risolve un problema che non abbiamo: un progetto che serve davvero più
brand insieme.

**Un progetto può nascere senza brand e sceglierlo dopo.** ✅ È il caso normale, non l'eccezione:
si apre una tela per esplorare, si generano immagini e testi, e solo quando il materiale diventa
qualcosa da pubblicare si decide per chi. Costringere a scegliere un brand al primo click
trasformerebbe il canvas da foglio bianco in un modulo da compilare.

`brand_id uuid references brands(id) on delete set null` — nullable, come già scritto. Tre
conseguenze da gestire in codice, non nello schema:

- **Tutto il canvas funziona senza brand.** Generare testo, immagini, video, documenti, iframe non
  richiede un brand: richiede un prompt. Senza brand manca solo il *contesto* (voce, palette,
  target) che il prodotto inietterebbe nel prompt — non la possibilità di generare.
- **Serve al momento della promozione, non prima.** `posts.brand_id` è `not null`: si pubblica
  sempre *come qualcuno*. Se il progetto non ha un brand, la promozione lo chiede lì — ed è il
  punto giusto per chiederlo, perché è la prima volta che la domanda ha una risposta ovvia.
  Lo stesso vale per i nodi che dipendono da un brand: `products` (il catalogo è per brand),
  `social_account_feed` sui propri account, e le campagne.
- **Assegnarlo dopo non riscrive niente.** Un `UPDATE projects SET brand_id = …` e basta: i nodi
  non portano `brand_id`, quindi non c'è backfill. È questo che rende la scelta tardiva gratuita —
  e il motivo per cui il brand sta sul progetto e non sui nodi.

**? Cosa succede se il brand del progetto cambia** dopo che dei post sono già usciti. Proposta: i
post già creati non si toccano (hanno il loro `brand_id` al momento della promozione), i prossimi
prendono il nuovo. Il contrario — riscrivere lo storico — farebbe mentire le metriche.

**3. `node_runs`, tabella separata.** Solo l'ultima generazione in `data` sembra più semplice ma
toglie l'unica cosa che rende utile un nodo generativo: **confrontare**. Si genera, non piace, si
cambia il prompt, si rigenera — e si vuole tornare alla prima. `gen-history.ts` esiste già e se
l'aspetta.

```
## node_runs
id, org_id, node_id → nodes(id) on delete cascade
prompt, model, params jsonb
status ('running'|'done'|'failed'), error
output_asset_id → assets(id)
cost_usd numeric, started_at, finished_at
created_at
```

Porta in regalo il costo per nodo, che in `data` sarebbe sovrascritto a ogni giro — e il costo è
il dato che dice se il prodotto sta guadagnando.

**4. Sì, tabelle proprie: `social_posts`, `products`, `competitor_ads`.** ✅
Un feed da 200 post dentro `data` gonfia la riga del nodo, viaggia intero a ogni evento realtime
(cioè a ogni spostamento del nodo) e non si interroga. Nel nodo resta solo la *query*; il
contenuto sta accanto, con `unique (node_id, external_id)` che rende il refresh un upsert.

**5. Il nodo `products` filtra la tabella, non scarica.** La sincronizzazione è **una sola**, per
brand, e il nodo è una vista su quel catalogo (`limit`, `after`, `only_first_photo`). Due nodi
sullo stesso negozio che scaricano per conto loro sono due copie che divergono al primo cambio di
prezzo — e il prezzo sbagliato in un post è un danno vero. *Conseguenza:* il nodo deve poter dire
"aggiorna il catalogo", che è un'azione sul brand, non sul nodo.

**6. Pagina o parola chiave, sceglie l'utente.** ✅ *(già deciso — vedi il nodo `ads`)*

**7. `doc.public`: token, mai l'id.** Un id indovinabile è la stessa vulnerabilità di ogni link
"segreto" mai scaduto. Il prodotto ha già il modello giusto e testato — `shared-views.test.ts`
verifica che si salvi **solo l'hash** del token e che revocato, scaduto e inesistente diano un 404
**identico** (perché tre risposte diverse dicono a chi prova quale caso ha trovato). Si riusa
quello:

```
public_token_hash  text      -- l'hash, non il token
public_expires_at  timestamptz
```

**8. Cicli vietati, non limitati in profondità.** Il limite di profondità nasconde il problema:
l'esecuzione si ferma dopo N giri, ma l'utente ha un grafo che non può spiegare e un conto che è
girato N volte. `connect-rules.ts` decide già quali archi siano leciti: **il ciclo si rifiuta
mentre il puntatore è ancora in aria** — che è esattamente la filosofia scritta in `graph.ts`,
*«dire che questo arco non si può fare mentre il puntatore è ancora in aria, invece di scoprirlo
spendendo»*. Un DFS sugli archi del canvas prima di inserire, e un messaggio che dice perché.

**9. `influencers`: rimandala.** È l'unica tabella che nella bozza non ha `org_id` né relazioni, e
il motivo probabile è che non è ancora chiaro a cosa serva. Se sono **volti ricorrenti** per la
coerenza dei personaggi tra immagini e video, allora non è una tabella a sé: è un `asset` con un
ruolo, e `pictures` deve puntare ad `assets` (le stesse immagini servono come riferimento ai
modelli). Se è un'anagrafica di **influencer veri** con cui collabori, è un CRM — un pezzo di
prodotto diverso, con contatti, accordi e compensi.

Non aggiungerla finché non è chiaro quale delle due: una tabella senza consumatori è più difficile
da togliere che da mettere.

---

## Cosa resta davvero aperto

Tutto il resto ha una risposta qui sopra. Le uniche due che vale la pena rimettere in discussione
**prima** di scrivere le migrazioni, perché costose da cambiare dopo:

- **(1) molti canvas per progetto** — se sei certo che sarà sempre uno, la tabella sparisce.
- **(3) `node_runs`** — se la cronologia delle generazioni non serve al primo rilascio, resta
  `data` e la tabella si aggiunge dopo (ma si perde lo storico dei costi fino a quel giorno).
