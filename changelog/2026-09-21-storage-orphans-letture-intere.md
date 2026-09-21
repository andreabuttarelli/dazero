# Il raccoglitore di orfani leggeva una frazione, e non leggeva affatto

Il raccoglitore arrivato con `b1c16a33` aveva due difetti di lettura. Erano
entrambi invisibili: la suite era verde, perché il finto client restituiva
tutto in un colpo e serviva volentieri uno schema che in produzione non esiste.

## Il difetto dichiarato: l'inventario troncato

`listCoveredFiles` non paginava. PostgREST tronca a `max-rows`, che qui vale
1.000 — misurato, non supposto: `?limit=5000` su `market_posts` risponde
`content-range: 0-999/37444`. Con 20.917 oggetti in `wall` e 8.054 in
`brand-knowledge`, l'inventario ne vedeva mille.

Sbagliava dalla parte sicura — un file assente dall'inventario non viene mai
proposto — ma il report sottostimava di venti volte, e un raccoglitore che si
accende sulla fiducia di un numero falso è il modo di scoprire da un cliente
quale area credeva di coprire.

## Il difetto opposto, cercato apposta: i riferimenti

`referencedPaths` paginava già, e la direzione dell'errore lì è l'opposta e
molto peggiore: un path nominato da una riga che la query non ha letto sembra
orfano. `market_posts` ha 37.444 righe — trentasette pagine, ed è letta due
volte perché referenzia due bucket. Fermarsi alla prima avrebbe proposto per la
cancellazione quasi tutto `wall`.

Il ciclo però chiedeva le pagine **senza `order`**. Due `range` consecutivi
senza ordine totale sono due query indipendenti, e Postgres non promette che
restituiscano la stessa sequenza: una riga può ricomparire nella pagina dopo, e
— il caso che costa — può non comparire in nessuna. Oggi sulle tabelle vere
l'ordine risulta stabile perché il piano usa un index scan sulla chiave
primaria, ma è un accidente del piano, non un contratto: basta che il
pianificatore scelga un seq scan parallelo perché una riga sparisca fra due
pagine, e quella riga è un file vivo proposto per la cancellazione.

Con quali colonne si ordina non poteva stare nel ciclo: `social_thumb_cache`
non ha `id`, la sua chiave è `(platform, handle)`. Un `'id'` scritto a mano
funziona su otto tabelle su nove e fallisce sulla nona il giorno che ha la prima
riga — oggi ne ha zero, quindi il difetto sarebbe stato invisibile fino ad
allora. La colonna d'ordine è perciò una proprietà della tabella e sta nel
registro, accanto alla regola che governa, come tutte le altre eccezioni.

## Il difetto che non era stato dichiarato: l'inventario non era leggibile

`supabase.schema('storage').from('objects')` non funziona, e non "a volte":
PostgREST espone soltanto `public` e `graphql_public`, e ogni chiamata risponde
`PGRST106 — Invalid schema: storage`. Verificato con il client vero e la service
role contro la produzione.

Il raccoglitore non ha quindi **mai** prodotto un report in vita sua: restituiva
errore a ogni giro. I 582 orfani citati nella storia del modulo vennero da SQL
scritto a mano nella console, non da questo codice — ed è esattamente la
differenza che il commento del modulo chiedeva di non confondere.

Il ponte è `public.storage_objects_page`, migrazione `20260921170000`: legge,
non cancella, restituisce le tre colonne su cui il raccoglitore ragiona, ordina
per `id` internamente, ed è `security definer` con `search_path` fissato e
`execute` concesso alla sola `service_role`. **La migrazione non è applicata**:
finché non lo è, l'endpoint risponde 500 anche in `mode=report`.

## La guardia contro il troncamento silenzioso

`readAllRows` è la lettura condivisa dai due lati, e ha una regola sola: una
lettura intera o un errore, mai un insieme più piccolo che sembra intero. Se le
pagine non finiscono entro `MAX_REF_ROWS`, ritorna `error` invece di quel che ha
raccolto — l'endpoint ha già il comportamento giusto per un errore, si ferma
senza toccare niente. Un elenco di riferimenti incompleto propone file vivi: è
l'unico esito che non può passare inosservato.

## I numeri veri, in sola lettura

Il codice vero, eseguito contro la produzione con la service role:
`referencedPaths` legge **26.835 path referenziati** senza troncare (prima si
sarebbe fermato intorno a mille per tabella).

Sui 26.976 file coperti, la decisione del codice e quella dell'SQL coincidono
esattamente: **582 orfani**, e zero file che l'SQL proponeva e il codice salva —
nessun file vivo a rischio.

    brand-knowledge/history      1.655 file    508 orfani
    brand-knowledge/market       4.247           23
    brand-knowledge/media           95           13
    brand-knowledge/people          18           15
    brand-knowledge/artifacts       44            0
    wall/wall                   20.917           23

Nessuno dei 582 rientra nelle 24 ore di grazia: il più recente è di oltre un
mese fa, che è la stessa cosa che aveva già osservato chi ha scelto la soglia.

## Perché niente changelog pubblico

Il raccoglitore non è agganciato ai cron e non ha mai cancellato un file. Da
fuori non cambia nulla: non c'è una frase onesta da scrivere a un cliente su una
correzione a uno strumento mai acceso.
