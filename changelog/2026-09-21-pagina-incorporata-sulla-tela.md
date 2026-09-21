# La pagina incorporata: un sito dentro la tela, o dell'HTML scritto a mano

Quarta voce nel menù del doppio clic e nella barra in basso. Una tile che porta una pagina web —
per indirizzo, o per codice — accanto ai nodi che producono testo, immagini e video.

## È il ROVESCIO del nodo che produce, e da lì viene ogni scelta

`gen` nasce vuoto e si riempie girando: `ref_id` è null *finché non ha prodotto*. Questo nasce
pieno e non gira mai, quindi `ref_id` è null **sempre** — non c'è nessuna riga di nessuna tabella
a cui puntare, e un `ref_id` facoltativo qui inviterebbe a inventarne una. Nel vincolo
`brand_canvas_items_ref_shape` si comporta come `note`, non come `gen`.

Non si genera, quindi in `graph.ts` è una SORGENTE come `document` e `memory`: `generated: false`,
`accepts: []`. È `text` perché quel che se ne può usare a valle è quel che c'è scritto — l'immagine
che il sito mostra è del sito, non c'è un file da passare avanti. Così «riassumi questa pagina» e
«fai un'immagine ispirata a questa» sono archi leciti, che è la ragione per cui vale la pena
metterla nel registro invece di lasciarla arredamento.

## Due colonne, non un `body` con un discriminatore

La strada scartata era `body` che tiene l'uno o l'altro, con una colonna a dire quale. Un campo
solo, e sembra più economico. Non lo è: `body` è già «il testo di una nota», e farne «l'URL, o
l'HTML, o il testo — dipende dai vicini» dà un campo che significa tre cose diverse a seconda di
chi gli sta accanto. È la stessa ragione per cui ieri `medium`, `model` e `prompt` sono diventati
colonne invece di un JSON.

E soprattutto: **un discriminatore è una terza verità che può divergere dalle altre due**.
`source = 'url'` con l'URL vuoto e l'HTML pieno è una riga coerente con se stessa e impossibile da
disegnare. Con due colonne il discriminatore non serve — quale delle due è piena DICE già quale
modo è — e `brand_canvas_items_iframe_source` impone uno e uno solo, nella stessa forma di
`ref_shape`: entrambi pieni non è una scelta da fare al posto di chi scrive, è una riga che il
renderer non sa disegnare.

## La sandbox è la decisione che conta, e non si tocca

`allow-scripts` insieme ad `allow-same-origin` **non è una sandbox**: è una sandbox che il
documento incorporato può smontare — arriva a `parent.frameElement`, toglie l'attributo e si
ricarica senza. La specifica HTML lo dice, MDN lo chiama «no more secure than not using the
sandbox attribute at all».

Qui non è teoria, ed è per il secondo modo. Un `src` verso un sito di terzi vive su un'altra
origine e la manovra non gli riesce; ma `srcdoc` eredita l'origine di chi lo contiene — la nostra.
E quell'HTML lo scrive un membro del brand, o l'agente. **I brand sono condivisi** (RLS su
`auth_brand_ids()`): quel che scrive uno lo apre un altro, con i propri cookie. Sarebbe XSS
depositato sul dominio dell'app, servito dalla nostra pagina.

Quindi `allow-same-origin` non si concede mai, e un test lo tiene fermo — verificato rosso
mettendolo davvero. Gli script invece si concedono: senza, un embed non è un embed (video, mappe,
grafici sono tutti script) e la tile è un rettangolo bianco. Su un'origine opaca non vedono né i
cookie né il DOM dell'app. Il costo, pagato volentieri: dentro la sandbox `localStorage` e i
cookie non funzionano, e qualche embed che li pretende non andrà.

**L'HTML non si sanifica**, ed è deliberato: un sanificatore toglierebbe proprio gli `<script>`
che rendono un embed un embed, e in cambio darebbe una difesa aggirabile. La sandbox è una
garanzia del browser, non una lista di tag — qui la difesa più forte e quella che non rompe il
prodotto sono la stessa cosa.

## `assertPublicUrl` NON c'è, e il perché è il punto

Quel guardiano esiste contro l'SSRF: il *server* che va a prendere un indirizzo scelto da uno
sconosciuto. Qui il server non fetcha niente — scrive una stringa e la rimanda al browser, che la
carica con la rete di **chi guarda**. Un `http://192.168.1.1/` incorporato non raggiunge la nostra
infrastruttura: al massimo il router di casa di chi apre la tela, che il suo browser può già
aprire dalla barra. E l'iframe è su un'origine opaca, quindi chi ha scritto la tile non può
leggerne il contenuto: nessuna esfiltrazione.

C'è anche una ragione per non metterlo: risolve il DNS a ogni salvataggio — una risoluzione per
battuta su un campo che si scrive — e renderebbe non salvabile una dashboard sulla rete aziendale
di chi usa il prodotto, che è esattamente il genere di cosa che uno incorpora nella propria tela.

Resta il filtro sugli schemi, in tre punti: `javascript:` in un `src` esegue sull'origine di chi
incorpora, ed è la stessa falla presa dall'altra parte. Il vincolo in migrazione è quello che
nessuna strada di scrittura può aggirare — e l'agente scrive di suo.

## Quando l'iframe resta bianco

Molti siti rifiutano di essere incorporati (`X-Frame-Options`, `frame-ancestors`), e il rifiuto
arriva dentro il browser di chi guarda: la pagina padre non riceve nessun errore, `onerror` non
scatta. Nemmeno chiederlo dal server aiuterebbe — quelle intestazioni parlano di chi incorpora,
non di chi chiede. Quindi non si indovina: il link «apri in una scheda» sta **sempre** accanto al
riquadro, e un rettangolo bianco ha già la sua via d'uscita nel momento in cui compare.

## Difetti trovati scrivendo i test prima

1. **`normalizeEmbedUrl` travestito.** Completare lo schema mancante prima di leggerlo trasforma
   `javascript:alert(1)` in `https://javascript:alert(1)`, che passa il controllo. Lo schema si
   legge PRIMA di completare.
2. **`missing` sbagliato**, lo stesso che `gen` aveva pagato ieri: un iframe si disegnava come
   «questa cosa non c'è più». Non è sparito niente — non c'è mai stata una riga.
3. **`saveCanvasPositions` accettava un iframe.** Quella strada ritrova una tile dal suo
   *referente*, e un iframe non ne ha: passava il controllo su `ref_kind` e arrivava al database.
4. **Il guardiano dei tipi ammessi confrontava il vincolo sbagliato.** Prendeva l'ultimo
   `ref_kind in (...)` del file, che nella mia migrazione è dentro `ref_shape`
   (`'note', 'iframe'`), non `ref_kind_check`. Era rosso, ma per il motivo sbagliato — e sarebbe
   tornato verde il giorno in cui quei due elenchi avessero coinciso per caso. Ora cerca il
   vincolo per nome.
5. **Il test della sandbox era troppo ottuso.** Cercava `allow-same-origin` in tutto il file, e
   il commento che spiega perché quel permesso non si dà lo faceva fallire: avrebbe costretto a
   togliere la spiegazione per farlo tacere, cioè a pagare con l'unica cosa che impedisce di
   rifare l'errore. Ora guarda il valore degli attributi.

Il predicato `carriesOwnContent` non è estetica: senza, il compilatore lascia scrivere
`REF_SELECT[kind]` su un tipo che non ha riga — il `TypeError` con cui ieri un nodo riuscito
rendeva illeggibile l'INTERA tela. Adesso l'accesso è provato, non sperato.

## Cosa NON fa

La tile si salva solo quando ha un contenuto: appena nata non ha né indirizzo né HTML, e il
vincolo la rifiuterebbe: la riga nasce al primo salvataggio utile. Non c'è anteprima del titolo
del sito, non c'è ricarica manuale, e non si sa dire in anticipo se un sito si lascia incorporare
— quest'ultima non per pigrizia: non è conoscibile dal server.
