# `enhance_prompt`: il brief riscritto per il modello che lo renderà

I registri `image-craft` e `video-craft` mettono le note **accanto** al prompt: istruzioni che il
modello deve applicare da solo mentre disegna. Questo fa l'altra metà — prende `(prompt, model)` e
restituisce il brief **già riscritto**. Segmenti etichettati per GPT Image, un paragrafo di frasi
connesse per Nano Banana, un comando invece di una descrizione quando Seedream modifica.

Non un suggerimento da seguire: un testo da mandare.

## Il registro è la fonte, questo è un suo consumatore

Il prompt di sistema si compone da `imageCraftFor` / `videoCraftFor`. Tenere qui una seconda copia
delle regole per modello significherebbe vederle divergere al primo modello nuovo — il difetto che
il registro esiste per evitare.

## Il controllo, che è la parte che decide se serve o fa danni

Un riscrittore che cambia anche il CONTENUTO è il modo normale in cui questi strumenti falliscono:
il brief dice «un barattolo di miele» e torna con un cane sotto il tavolo. Quindi ogni output passa
da `checkRewrite`, e **un output che non passa non viene corretto: si scarta**. Torna l'originale
con `changed: false` e il motivo in `notes`. Un prompt che l'utente ha scritto lui non si
sostituisce con qualcosa di peggio.

I controlli sono **deterministici, non un secondo giudizio LLM**: un modello che giudica l'output
di un modello costa un'altra chiamata e sbaglia in modo correlato al primo.

- i token del brief devono sopravvivere (`tokenize`, lo stesso dei link interni);
- il vocabolario comparso dal nulla non può superare una quota del totale;
- testo leggibile chiesto, inquadratura dichiarata, prompt gonfiato: tre regex.

## Il controllo sbagliato, e come l'ha detto il modello vero

Le prime due versioni misuravano **quanto era comparso**: un tetto sulla crescita e una quota di
vocabolario nuovo. Con un runner finto passavano tutti i test. Sul modello vero **rifiutavano
tutto**, e questa è la misura che l'ha detto:

| brief | riscritto | rapporto |
|---|---:|---:|
| «a jar of honey on a linen cloth, morning light» (46 car.) | 1.010 car. | **22×** |

E la riscrittura era **buona**: nominava l'ombra di contatto, la temperatura in Kelvin, la trama
del lino sotto la luce radente. Cinque token nel brief, ottantasei nella riscrittura — perché
nominare luce, materiale e ottica **è** il mestiere che le avevamo chiesto.

Quei controlli misuravano il craft e lo chiamavano invenzione. E la quota aveva un secondo difetto
che nessun test con runner finto avrebbe mostrato: un elenco di parole ammesse vive in una lingua
sola, quindi un brief italiano ha ogni parola «nuova».

**La domanda giusta è una sola, e guarda dall'altra parte: cosa è SPARITO.** Ogni cosa che il brief
nomina deve essere ancora nella riscrittura — non una quota, tutte. `tokenize` tiene le parole oltre
le tre lettere e fuori dalle stopword, cioè esattamente i sostantivi che nominano le cose. Se il
brief dice miele e lino, la riscrittura parla di miele e lino; perderne uno non è uno stile diverso,
è un altro brief. E non dipende dalla lingua.

Del tetto sulla lunghezza resta solo il muro contro un modello che ha perso il filo: 4.000
caratteri, che nessun renderer legge per intero comunque.

Poi il modello vero ha detto anche la seconda cosa: `morning light` torna come `morning lighting`,
e un confronto letterale la chiamava soggetto perso. Una parola flessa è la stessa parola, quindi
il confronto guarda il prefisso — e basta, perché `tokenize` ha già tolto le parole sotto le
quattro lettere e non restano frammenti corti che collidono con mezzo vocabolario.

E una terza, che il prefisso non copriva. Su cinque giri, due riscritture venivano bocciate per
`light`, e quelle riscritture dicevano: *«Low morning sun rakes in from the left at a warm 3800K,
glowing through the honey»*. La luce c'è, descritta meglio di com'era nel brief — manca la parola.
Pretendere che ogni parola sopravviva bocciava due riscritture giuste su cinque, e un elenco di
sinonimi (`sun` per `light`, `dawn` per `morning`, in ogni lingua) sarebbe una taratura a occhio
senza fine.

Quindi **una parola può mancare, e non di più**. Un brief di due o tre sostantivi resta protetto —
perderne uno su tre supera comunque la soglia — e il caso che conta, la scena sostituita da
un'altra, ne perde molte insieme. Verificato su quattro casi: passa il sinonimo, bocciano la scena
sostituita, il soggetto cambiato e il singolo oggetto sparito.

Il tasso di accettazione sullo stesso brief, misurato prima e dopo su cinque giri: **da 3/5 a 5/5**,
senza che nessuno dei quattro casi da bocciare passi.

La lezione, che vale oltre questo file: **un controllo su output di modelli non si tara con un
runner finto.** I quindici test col runner finto erano tutti verdi mentre lo strumento, in
produzione, avrebbe rifiutato ogni singola riscrittura — e i due difetti che lo rendevano inutile
sono venuti fuori entrambi dalla prima chiamata vera.

## Senza brand, come i motori

`pathWithoutBrand` era riservato ai quattro motori, e il test che lo difendeva ha fatto il suo
lavoro: ha chiesto conto della quinta voce. La risposta è che vale la stessa ragione un passo più
indietro nella catena — se disegnare un gatto non chiede di scegliere l'azienda a cui addebitarlo,
riscrivere il brief di quel gatto non può chiederlo. Il commento di `brand-free.test.ts` descrive
esattamente questa incoerenza.

## Il tetto del `tools/list` è stato tolto

`enhance_prompt` ha sfondato il budget di 89.000 caratteri — che era a 88.948, cioè con **52
caratteri** di margine. A quel punto il tetto non separava più «un tool in più» da «la superficie è
fuori controllo»: bocciava ogni capacità nuova qualunque cosa fosse.

Al suo posto resta ciò che serviva davvero a fare: la lista si **misura** e il numero si stampa nel
test. I due controlli che colpiscono lo spreco per tool — niente `$schema`, niente `taskSupport` —
restano, e sono guardie vere: è così che la lista era cresciuta del 30% senza che nessuno
aggiungesse niente. `docs/mcp-tools.md` rigenerato: 81 tool, 90.410 caratteri.

## Quello che questo commit NON fa

Non dice se riscrivere migliora le immagini. Il giudice del mestiere rende il confronto possibile —
stesso brief, stesso modello, con e senza enhance, si contano i controlli caduti — ma il confronto
costa due giri di render veri e non è stato fatto.

E nessuno lo chiama da solo: è un tool che un agente deve scegliere di usare prima di generare.
Farlo diventare un passo automatico di `generate_image` è un'altra decisione, che va misurata prima
di essere presa.
