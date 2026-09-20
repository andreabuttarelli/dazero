# Canvas: la precondizione che mancava, e le fondamenta della tela

Due pezzi. Il primo è un difetto attivo che vale a prescindere dal canvas; il secondo sono le
tabelle su cui la tela poggerà.

## La sovrascrittura silenziosa, finalmente impedita

La migrazione `0224` aveva aggiunto `posts.updated_at` con un trigger, e la sua intestazione diceva
perché: *«una patch sovrascriveva in silenzio il lavoro di chi nel frattempo aveva modificato il
post (persona sul browser, altro agente, autopilot)»*.

La colonna c'era, il trigger c'era, e **nessun codice li usava**: `applyPostEdits` scriveva
`update(patch).eq('id', id)`, filtrando sul solo id.

Ora `edit_post` accetta `expected_updated_at` — la versione che il chiamante ha letto prima di
decidere la modifica. Se qualcuno ha scritto nel frattempo, la scrittura è rifiutata con **409
`stale_post`** invece di calpestarlo.

Tre decisioni:

- **Resta opzionale.** Chi scrive un campo che non dipende da ciò che ha letto — uno stato, l'id di
  un media appena reso — non ha una versione da difendere, e obbligarlo aggiungerebbe una lettura a
  ogni scrittura per un conflitto che non può avere.
- **Zero righe aggiornate È il conflitto.** Postgres non lo segnala come errore: il post esiste ed
  è del brand — la rotta lo verifica prima — quindi un update che non tocca nulla significa una
  cosa sola. È l'unico modo di vederlo.
- **409, non 500.** Chi chiama deve rileggere e ridecidere: ritentare lo stesso patch riprodurrebbe
  esattamente la sovrascrittura che il guard evita.

## Le due tabelle della tela

`brand_canvases` e `brand_canvas_items`, con lo stesso cancello RLS del resto dell'app
(`auth_brand_ids()`, che copre i brand posseduti e quelli condivisi). Una tela è del brand, non di
chi l'ha aperta: un canvas visibile solo al creatore sarebbe una lavagna in una stanza chiusa a
chiave.

**Una tile non copia ciò che mostra.** Porta `ref_kind` + `ref_id` e la sua posizione; il post resta
in `posts`, il media in `brand_media`, il documento in `brand_documents`. Copiare il contenuto
darebbe due verità sullo stesso oggetto e una tela che il giorno dopo mostra un titolo vecchio — la
stessa ragione per cui `graphic_designs` tiene la spec e non i pixel.

`ref_kind` è un check, non quattro FK nullable: quattro colonne e quattro vincoli per la stessa
domanda sarebbero quattro posti da cambiare al quinto tipo.

**Niente cascata dal referente, e non è una dimenticanza.** Un post cancellato lascia una tile che
dice «questa cosa non c'è più». Sparire di soppiatto da una tela che qualcuno sta guardando è il
modo peggiore di dare la notizia, e toglie pure la possibilità di rimettere qualcosa al suo posto.
`hydrateCanvasItems` marca quelle tile `missing`, e un test lo fissa.

**Posizioni in unità di tela, non in pixel.** Lo zoom è una proprietà della vista, non del dato:
salvare pixel legherebbe la tela alla finestra di chi l'ha spostata per ultimo.

**`updated_at` col trigger da subito**, su entrambe le tabelle. Non si lascia al codice: ogni strada
di scrittura deve muoverlo, o la precondizione «la riga è ancora quella che ho letto» non vale
niente. È la lezione di `0224` applicata *prima* che il difetto si presenti, invece che dopo.

## La lettura: una query per tipo, non per tile

`loadCanvasItems` prende le tile, raggruppa i riferimenti per tipo e fa una query per ciascuno —
una tela ha molte tile per definizione, e una query ciascuna sarebbe N+1 garantito.

Le righe arrivano dal client dell'utente, quindi **è Postgres a decidere cosa si vede**: una tile
che punta a un oggetto di un altro brand torna `missing` invece di rivelarlo.

## Da applicare a mano

I deploy non eseguono le migrazioni. `node scripts/schema-drift-check.mjs` oggi dice:

```
MIGRATION SCRITTE MA NON APPLICATE (1)
  supabase/migrations/20260919160000_brand_canvas.sql
    assenti nel database: brand_canvases, brand_canvas_items
```

`query-tables.ts` e `write-rules.ts` sono già rigenerati, quindi gli agenti sapranno leggere e
scrivere quelle tabelle appena esisteranno.

## Quello che questo commit NON fa

Non c'è ancora nessuna tela da guardare: mancano il pan/zoom, le tile e il broadcast. Queste sono
le fondamenta, e la precondizione — che è l'unico pezzo che serviva comunque, canvas o no.
