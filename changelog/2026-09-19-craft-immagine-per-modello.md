# Il craft immagine per modello, e il cancello che tiene il registro onesto

Gemello di `video-craft.ts`, stessa ragione: i quattro modelli immagine che serviamo vogliono
prompt di forma diversa, e scrivere a uno come si scrive a un altro non produce un errore — produce
un'immagine mediocre, che è il difetto che non si vede.

- **GPT Image** vuole segmenti etichettati su righe separate, non un paragrafo. Sa scrivere
  davvero, quindi il testo va fra virgolette con la sua collocazione, e una parola difficile si
  compita lettera per lettera. Non produce sfondi trasparenti: chiederne uno è chiedere niente.
- **Nano Banana** vuole l'opposto: frasi connesse, e va detto a cosa serve l'immagine, non solo cosa
  contiene.
- **Seedream** indirizza le immagini per numero di figura, e in modifica vuole **un comando, non la
  descrizione del risultato**.
- **Qwen** non ha una guida, né da noi né nella fonte. La sua voce dice solo ciò che il registro sa
  per misura — tre riferimenti inoltrati, la dimensione al posto del rapporto — e tace sul resto.
  Inventare un consiglio è peggio che non darne.

## L'inversione che nessuno indovina

Su Nano Banana, per trasformare una foto in illustrazione l'istruzione va **accorciata**. È il
contrario di quel che vale ovunque altrove: accumulare vincoli su una trasformazione stilizzata la
riporta verso la fotografia, e il vocabolario di camera fa lo stesso. Va tolto, non aggiunto.

Questo tipo di regola è il motivo per cui il porting vale: è una cosa che si impara bruciando
generazioni, e che nessun prompt generico contiene.

## Il cancello

Un test verifica che **ogni** modello di `IMAGE_MODEL_CHOICES` abbia il suo craft. Un modello
aggiunto al registro senza queste righe fa fallire quel test, invece di uscire in silenzio con un
prompt generico — che è esattamente come il pavimento del craft era caduto, senza che niente
diventasse rosso.

E il craft si lega per **frammento di famiglia**, non per id esatto: `nano-banana-2`, `-2-lite`,
`-pro` e gli id Gemini equivalenti condividono sintassi e difetti. Legarli uno per uno vorrebbe dire
che la prossima variante esce senza craft.

## Il cavo, ancora una volta nel chokepoint

`buildImageRequest` risolve già il modello sopra la composizione del prompt, quindi le note escono
da lì senza che nessun chiamante passi niente. Verificato sul prompt vero: il default risolve a
GPT Image 2.5 Sunburst e riceve le note GPT Image, la famiglia riconosciuta dal frammento.

Scriverle dal chiamante avrebbe voluto dire ricopiarle in tredici punti, cioè dimenticarle in uno.

## Quello che questo commit NON fa

Le note sono istruzioni che il modello deve applicare **da solo** mentre disegna. Il brief resta
scritto come l'ha scritto chi l'ha scritto.

L'altra metà — prendere `(prompt, model)` e restituire il brief già riscritto nella forma che quel
modello vuole — è un endpoint `enhance_prompt`, ed è ora nel piano come Passo 5b
(`docs/research/2026-09-19-craft-e-canvas.md`), con i quattro vincoli che decidono se è utile o
dannoso e il modo di misurarlo col giudice del mestiere.
