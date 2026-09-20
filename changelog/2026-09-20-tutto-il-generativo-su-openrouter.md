# Tutto il generativo passa da OpenRouter: kie esce

Un secondo fornitore è uscito, e non per prezzo. kie falliva il 3,5% dei render con un p95 di
142,9s contro i 3,4s del gateway, e ogni strada che lo attraversava portava una sua stranezza da
compensare: i job asincroni, i riferimenti caricati come url invece che in linea, una risposta
HTTP 200 che dentro dice `{code: 402}`, i crediti da convertire a mano in dollari.

## Cosa si è mosso, in ordine

**La voce.** `/audio/speech` sul gateway, senza ripiego. Il ramo kie del TTS era già codice
irraggiungibile — `generateSpeechOnKie` non aveva un chiamante di produzione — ma il ripiego
prometteva una strada che non esisteva: senza chiave si annunciava «ripiego su kie» e poi si
falliva comunque. Ora la chiave mancante fallisce dicendo quale chiave manca.

**Le immagini.** Era il 96% del traffico kie vivo: 101 render a settimana su `nano-banana-2-lite`,
che sul gateway è `google/gemini-3.1-flash-lite-image`. Spostandolo è saltato fuori un difetto
vero, sotto (vedi «Il cancello che non si vedeva»).

**Il testo.** `ai-text.ts` sceglieva fra due trasporti e ripiegava sull'altro quando il primo
falliva. Quel ripiego è il motivo per cui prima DeepSeek e poi MiMo sono rimasti cablati mesi dopo
aver smesso di funzionare: un primo tentativo condannato non si nota se qualcuno lo salva sempre.
Con `PIN_GATEWAY` se ne vanno diciassette call site — fissare un lavoro all'unico trasporto che
c'è non dice niente, ed era il terzo nome della stessa costante.

**Il design e gli agenti.** `design-compose` e `design-typography` chiamavano `structuredKie`
DIRETTO, scavalcando `ai-text`: sigillare il centralino non li avrebbe toccati. Il produce agent
teneva un client kie vivo e rifaceva il round sul gateway quando moriva.

## I due modelli che si perdono

Runway Aleph e Kling V3 Turbo erano gli unici senza un id OpenRouter, quindi senza trasporto.

Aleph faceva `refine`, e quel ruolo è coperto due volte: Seedance 2.5 legge davvero un video in
ingresso — un `input_references` di tipo `video_url` con un url irraggiungibile torna «resource
download failed» su quel campo, cioè lo scarica — e FLUX Video Upscale esiste solo per questo.
Con Aleph esce anche `endpoint` dal registro: aveva due valori perché Runway voleva i campi in
camelCase su un percorso suo, e un campo che può dire una cosa sola non decide niente.

Il test ora percorre OGNI ruolo e fallisce su qualunque modello non raggiungibile: è la domanda
giusta, perché un modello senza trasporto non si scopre finché un brand non lo sceglie.

## Il cancello che non si vedeva

Spostare i quattro test del render sul trasporto che usano davvero ha scoperto un difetto che
nessuno poteva vedere: il ramo dell'API immagini restituiva il render **saltando `review()`**,
mentre gli altri due lo chiamavano. Un'immagine bocciata per il logo del brand stampato su un
capo — il caso esatto per cui il cancello esiste — usciva comunque, su ogni modello servito da
quella API.

Il test che lo prende era già scritto e già rosso: asseriva contro un mock che il codice non
raggiungeva più. Due volte nella stessa sessione, sullo stesso file: la lezione sta in
`LESSONS.md` — un mock che finge il trasporto sbagliato è una suite verde su codice mai eseguito,
e il segnale è il cronometro, non l'asserzione.

## Cosa resta, e perché

`KIE_CREDIT_USD` e il membro `'kie'` dell'unione `provider` restano finché le ultime righe video
si scrivono. **Non servono allo storico**: `computeCostUsd` prezza in SCRITTURA, dentro l'insert
(`ai-log.ts`), e le 2.374 righe kie già prezzate portano $169,50 congelati in `cost_usd`. Nessuna
lettura riprezza niente, e nessun CHECK fissa la stringa: verificato su `pg_constraint`.

Il pericolo delle clip in volo al deploy non era reale: `video_renders` ha 4 righe, tutte `done`,
l'ultima del 5 settembre. Niente da drenare.
