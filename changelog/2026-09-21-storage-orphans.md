# Un registro di quali file una riga tiene in vita, e un raccoglitore che osserva prima di togliere

## Cosa c'era prima

La pulizia dello Storage era sparsa e quasi tutta assente. Su trentotto moduli che toccano i
bucket, **due** endpoint toglievano il file insieme alla riga — `studio/documents/[id]`
(`file_url`, bucket `brand-knowledge`) e `studio/people/[id]` (`images`, array di `{path}`) — e
nessuno dei due sapeva dell'altro. `DELETE /api/v1/brands/:slug/web/article/:id` cancellava
l'articolo e lasciava la sua `cover_image` nel bucket per sempre.

Il problema stava per peggiorare: sette tool di cancellazione dedicati sono stati sostituiti dal
generico `delete_row` (`src/lib/server/chat/write-tool.ts`), e senza una strategia ogni
cancellazione fatta dall'agente avrebbe lasciato file orfani.

## La misura che ha deciso il progetto

La prima misura, ingenua, diceva **8.022 orfani su 8.054** in `brand-knowledge` — cioè quasi tutto
il bucket. Era **falsa**, ed è la falsità il fatto importante: quei file erano referenziati da
tabelle che la query non guardava. Un raccoglitore scritto con quella logica avrebbe svuotato il
bucket di clienti veri.

Le misure vere, per area:

| bucket / area | file | non referenziati | orfani (>24h) |
|---|---|---|---|
| `brand-knowledge/history` | 1.655 | 508 | **508** |
| `brand-knowledge/market` | 4.247 | 23 | **23** |
| `wall` | 20.917 | 23 | **23** |
| `brand-knowledge/people` | 18 | 15 | **15** |
| `brand-knowledge/media` | 95 | 13 | **13** |
| `brand-knowledge/artifacts` | 44 | 0 | **0** |

**582 orfani veri su 26.976 file coperti: il 2,2%, non il 99,6%.**

`history/` da solo è il 87% dell'arretrato, e la sua misura è anche quella che dimostra perché il
registro non può essere una tabella sola: guardando solo `social_post_history.thumbnail_path` ne
risultavano 508 orfani, e guardando anche `social_thumb_cache.paths` ne risultano... ancora 508.
La conferma vale quanto la scoperta. In `competitors/` invece la differenza è totale: guardando le
colonne ovvie risultava **0 su 867** referenziati; i path stanno annidati dentro
`competitors.top_posts`, `competitors.top_ads`, `brand_market_references` e una cache globale.

## Cosa è stato costruito

### Il registro (`src/lib/server/storage-refs.ts`)

Una tabella di regole in un posto solo — il CLAUDE.md lo chiede per le eccezioni: «si dichiarano in
un posto solo, accanto al modello che le governa, dove il caso nuovo è una riga e tutti si vedono
insieme». Nove regole, chiave `tabella + bucket` (una tabella può referenziare due bucket:
`market_posts` lo fa, `media_path` in `brand-knowledge` e `poster_path`/`preview_path` in `wall`).

**Due forme, non tre.** `path` (la colonna È la chiave) e `jsonb_path` (array di oggetti, chiave
dentro). **Non esiste una forma `url`**, ed è la decisione più importante del file: da un URL si
ricava un path solo indovinando il prefisso del progetto, e un prefisso sbagliato produce una
chiave *plausibile* che punta a un altro file. Le colonne che tengono URL restano fuori.

`brand_media` tiene lo stesso path in due colonne (`storage_path` e `url` — il bucket è privato e
l'url È il path): il dedup sta dentro `pathsInRow`, non nel chiamante.

La decisione «questo file è orfano» (`orphansAmong`) è **pura**: nessun client, nessuna rete.
L'ordine dei filtri è l'ordine della sicurezza — prima «è coperto?», poi «è referenziato?», poi «è
abbastanza vecchio?». Un file scoperto non arriva mai al confronto con i riferimenti, così un
insieme incompleto non può proporlo per errore.

### `deleteRow` che lo consulta

Tre passi, **in quest'ordine**, e l'ordine è l'invariante:

1. si leggono i path finché le righe esistono (dopo la DELETE la riga che li nominava non c'è più);
2. si cancellano le righe;
3. si tolgono i file.

Il verso opposto — file prima — sembra più prudente e non lo è: se la DELETE poi fallisse (RLS, una
foreign key, il timeout a 8s) resterebbe una riga **viva** che punta al vuoto, e l'utente la vede
rotta. Un orfano invece non lo vede nessuno: costa spazio, non fiducia. Fra i due danni si sceglie
quello reversibile.

Un secondo giro verifica che nessuna riga superstite nomini ancora quel file: la stessa foto può
stare nelle `images` di due persone, e cancellarla con la prima romperebbe la seconda.

Una `remove()` fallita **non** trasforma una cancellazione riuscita in un errore: le righe sono già
sparite, e dire «fallito» manderebbe l'agente a ritentare una DELETE che non trova più niente.

### Il raccoglitore (`storage-collect.ts` + `/api/v1/storage/orphans`)

- **Sola lettura come default.** `mode=report` dice «toglierei questi N, ecco i primi 50» e non
  tocca niente. `?mode=collect` è l'unica forma che cancella, e va chiesta per nome.
- **Periodo di grazia: 24 ore.** Un file appena caricato non è orfano, è un file la cui riga non è
  ancora stata scritta — fra `upload()` e `insert()` c'è una generazione che dura minuti, un job in
  coda, un turno ripreso dopo una disconnessione. La misura dice che non costa niente: dei 508
  orfani di `history/`, **zero** hanno meno di un mese.
- **Tetto: 200 file per esecuzione**, come `DELETE_MAX_ROWS` e per la stessa ragione.
- **Una lettura incompleta ferma il giro** invece di restringerlo: un errore su una tabella di
  riferimenti restituisce `error` e non tocca niente.

### La copertura, dichiarata come elenco chiuso

Coperte: `brand-knowledge/{history,people,media,artifacts,market}` e `wall`.

**Fuori portata, e dichiarato invece che dimenticato:**

- `competitors/` — path annidati in tre jsonb più `scrapecreators_cache`, che è una cache **globale
  a scadenza**, non per brand: «non referenziato» lì vuol dire «la cache è scaduta», un ciclo di
  vita diverso;
- `mood/`, `onboarding/` — finiscono in `brand_documents.file_url`, ma per percorsi che non ho
  seguito fino in fondo;
- bucket `media` — tutto URL pubblici, e `brand_articles.body_md` ne incorpora dentro il markdown:
  un raccoglitore cieco cancellerebbe le illustrazioni vive di un articolo pubblicato;
- `email-assets/` — nessuna colonna li nomina mai, per costruzione: vivono dentro email già spedite;
- `agent-docs/` — la verità è un registro nel codice, non una tabella, e `overrides/` cancellato **è**
  il rollback documentato;
- `agent-homes/` — i checkpoint vecchi sono orfani per costruzione, ma la colonna tiene un
  **prefisso** e non una chiave.

### La copertina dell'articolo (`article-cover.ts`)

Il difetto che esisteva già. `cover_image` è un URL pubblico, quindi fuori dal registro; ma tutti i
122 valori in produzione hanno la stessa forma esatta e nessun'altra, il che rende sicura
un'estrazione ristretta a quella colonna sola. Prima di togliere il file si verifica che nessun
altro articolo lo usi come copertina **e** che nessun `body_md` lo contenga.

Due letture invece di una `.or()`: un URL contiene punti e virgole, che sono la sintassi di un
filtro PostgREST, e interpolarcelo dentro significa un filtro che dice altro.

## Cosa è stato scartato

- **Un trigger Postgres che cancella il file.** Non può funzionare: i metadati stanno in
  `storage.objects` (Postgres), i byte su S3. Eliminare la riga lascia il file pagato e
  **irraggiungibile** — un orfano peggiore. Le `on delete cascade` valgono fra tabelle, non verso un
  bucket.
- **Una forma `url` nel registro.** Vedi sopra: l'indovinello del prefisso. Ristretto a una colonna
  di cui si conoscono tutti i valori (`cover_image`) è accettabile; generalizzato a `posts.media_url`
  e a `body_md` è un raccoglitore che cancella pagine vive.
- **Il cron acceso subito.** L'endpoint **non** è in `vercel.json` di proposito: va osservato in sola
  lettura per qualche giorno. Accendere un raccoglitore mai osservato è il modo di scoprire dalla
  segnalazione di un cliente che l'area coperta non era quella che si credeva.
- **Un `else` che cancella.** La copertura è un elenco chiuso. Un'area non coperta non è un'area
  vuota: se non sai chi referenzia `history/`, non tocchi `history/`.

## Cosa NON è stato verificato

- Le due aree `mood/` e `onboarding/` (22 file): so che finiscono in `brand_documents.file_url`, non
  ho confermato tutti i percorsi che ce le scrivono. Restano scoperte.
- `talent` ha una regola nel registro (`talent_views.path`) ma **nessuna area raccoglibile**: non ho
  trovato nessun writer nel repo, il bucket è popolato fuori banda.
- Il raccoglitore non è mai stato eseguito attraverso il suo endpoint: i numeri qui sopra vengono
  dalla stessa logica riscritta in SQL contro la produzione, in sola lettura.
