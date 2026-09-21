# I modelli nel menù, e le proprietà solo dove servono

Due cose che si vedevano subito aprendo un nodo: il menù del modello era vuoto su tutti, e ogni
nodo portava addosso una fascia di controlli anche quando non lo si stava toccando.

## Il catalogo veniva da nessuna parte

`catalogue` era `{ text: [], image: [], video: [] }`, scritto a mano con un commento che diceva
«arriva più tardi». Non arrivava: nessuno lo riempiva, quindi nessun modello era selezionabile e
«Genera» restava spento per costruzione.

Ora viene da due registri, e sono due perché sono cose diverse:

- **il testo** dal centralino (`openrouter-models`), dove un modello è finestra di contesto e
  capacità di chiamare tool, e dove l'elenco cambia da sé quando il gateway pubblica qualcosa di
  nuovo — senza toccare questo repo;
- **immagine e video** dal registro dei media (`media-model-slots`, slot `imageModel` e
  `videoModel`), che è l'unico posto a sapere in quali formati un modello disegna, quanto può
  durare una clip, quanti riferimenti inoltra e se fa audio.

Otto modelli per le immagini, sette per i video, coi nomi veri.

Un elenco solo avrebbe voluto dire inventare i campi mancanti su metà delle voci — una foto che
dichiara una durata, un modello di testo che dichiara un formato — cioè dire che quei campi
esistono e valgono zero. Il nodo chiede il catalogo del SUO medium.

Il catalogo si **aspetta** nel load, a differenza del recap: senza, un nodo creato nei primi
istanti avrebbe il menù vuoto e nulla direbbe perché.

## Le proprietà stavano addosso a tutti

Il commento in testa a `GenNode` sosteneva che un pannello a scomparsa nasconde proprio ciò che si
cambia fra un tentativo e l'altro. Vero per UN nodo; su una tela con dieci sono dieci file di menù
sopra quel che si sta guardando, e il contenuto — l'immagine, la clip — resta schiacciato sotto.

Ora la fascia compare sul nodo **selezionato**, e sta **fuori** dal suo corpo. Fuori e non dentro
perché dentro cambierebbe la misura del nodo, e tutto quel che c'è sotto salterebbe a ogni
selezione.

`selected` lo passa SvelteFlow a ogni nodo: è l'unico che sa davvero cosa è selezionato, e una
copia nostra divergerebbe al primo clic sullo sfondo. Arriva al contenuto attraverso lo snippet,
perché è il contenuto a decidere cosa farne — un nodo che produce apre le sue proprietà, il recap
non ha niente da aprire.

Conseguenza non ovvia: `overflow: hidden` è sceso dal nodo al suo corpo. Sul nodo intero
mangerebbe la fascia, che sporge apposta.
