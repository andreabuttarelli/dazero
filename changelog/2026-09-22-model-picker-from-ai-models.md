# Il picker dei modelli legge `ai_models`, non liste scritte a mano

Il picker di immagine/video (canvas, settings, `get_media_models`) leggeva `image-models.ts` /
`video-models.ts` / `media-model-slots.ts` come verità sola: qualunque modello lì elencato
compariva nel menù, sincronizzato o no. La regola decisa: *se la sync di OpenRouter non ha ancora
la riga di quel modello, l'utente non deve poterlo vedere*.

## La trappola misurata prima di scrivere codice

`ai_models` (già migrata, già sincronizzata) aveva 444 righe, 11 con `image` in
`output_modalities`, **zero** con `video`. Filtrare il picker su quella tabella così com'era
avrebbe svuotato il selettore video — non un caso limite, la conseguenza diretta di una premessa
sbagliata.

**OpenRouter pubblica TRE listini, non uno**, su tre rotte diverse — verificato chiamando le tre
con la chiave del repo, non assunto dal codice esistente:

```
/models         444 modelli di chat — quello che il sync leggeva
/images/models   52 modelli immagine — Seedream, GPT Image 2/2.5, Qwen: NESSUNO su /models
/videos/models   29 modelli video   — zero dei quali su /models
```

Il sync leggeva solo la prima. Il video non era assente da OpenRouter: era assente dalla rotta
sbagliata. Stessa cosa per metà del catalogo immagine — solo i tre Gemini/Nano Banana compaiono
anche su `/models` (parlano E disegnano), gli altri cinque no.

## Lo schema

`ai_models` aveva `id` come chiave unica. Lo stesso id compare su più listini con fatti diversi
(`google/gemini-3-pro-image` è sia una riga di chat sia una riga immagine, con
`supported_parameters` propri di quella rotta) — un upsert su `id` da solo avrebbe fatto scrivere
l'uno sopra l'altro, in un ordine che dipende da quale rotta il sync chiama per ultima, non da
quale dei due serve al chiamante.

`supabase/migrations/20260922180000_ai_models_catalogues.sql`: colonna `catalogue`
(`chat`/`image`/`video`), chiave `(id, catalogue)`. Applicata alla produzione (progetto
`klnswzhhgrqvbfjzioul`) e verificata via query diretta — non assunta.

Il video non dichiara `architecture.{input,output}_modalities` come gli altri due listini:
pubblica `supported_frame_images`/`generate_audio` invece. Le modalità di una riga video si
ricavano da quei campi al sync (`videoModalitiesOf` in `ai-models-sync.ts`) — sempre `video` in
uscita, `text` sempre in ingresso, `image` se accetta un fotogramma, `audio` se genera audio.

## La regola del prodotto, in codice

`src/lib/server/offerable-models.ts`: un modello è offerto SOLO quando ha ENTRAMBI —

- una riga sincronizzata in `ai_models` per il catalogo giusto (cosa il modello accetta, da
  OpenRouter)
- un nostro spec di integrazione in `image-models.ts`/`video-models.ts` (come lo si chiama: quale
  campo del corpo vuole i riferimenti, quanti ne inoltra, quanto può durare una clip, il prezzo)

Verificato leggendo le risposte VERE di `/images/models` e `/videos/models`: nessuna delle due
nomina `image_urls`/`input_urls`/`video_urls`, il campo che il nostro trasporto usa davvero.
`input_references: {min:0, max:16}` è un tetto numerico, non il nome del campo. Questi fatti
restano nostri — non è stata trovata una fonte OpenRouter che li sostituisca.

Conseguenza simmetrica: un nostro spec SENZA una riga sincronizzata (l'avevamo integrato, il sync
di oggi non lo conferma più) resta fuori anche lui, stessa disciplina già in
`upstream.ts::modalitiesFor` per il blocco di un nodo con un modello sparito.

`canvas-catalogue.ts` (la funzione unica che i due `+page.server.ts` della tela e le settings
chiamano) ora incrocia `offerableModels`/`offerableSlotChoices` invece di leggere
`slotChoices` così com'era. Stessa fonte per il picker e per `connectors.ts` — letto, non
toccato: entrambi leggono `ai_models`, quindi un modello scelto ha sempre i connettori giusti.

## Tabella vuota, o non ancora sincronizzata

`OfferableModels.synced` distingue "zero righe perché il sync non è mai passato" da "zero
modelli perché quel mestiere non ne ha". Il canvas (`GenNode.svelte`) e le settings video
mostrano "Catalogo modelli non ancora sincronizzato" invece di un `<select>` muto quando è il
primo caso — un dropdown vuoto senza spiegazione è indistinguibile da un difetto.

Il sync (`/api/v1/ai-models/sync`, `syncAiModels`) resta l'unico endpoint, girabile a mano con lo
stesso secret del cron (già vero prima di questo cambio) — non è stato costruito un secondo
endpoint per un pulsante che questo repo non ha altrove per nessun altro sync.

## Cosa NON è stato fatto in questo giro

Un coordinatore ha chiesto, a metà lavoro, di cancellare `image-models.ts`/`video-models.ts` per
intero sulla base che "OpenRouter pubblica tutto". Verificato contro le risposte vere delle due
rotte prima di eseguire: **falso per `imageField`/`videoField`/`maxRefs` per ruolo** — nessun
payload nomina il campo del corpo che il nostro trasporto usa. La richiesta contraddiceva anche
un'istruzione esplicita e ancora valida nello stesso task ("They stay") e toccava file che due
altri agenti stavano modificando in parallelo (`canvas/generate.ts`,
`connectors.ts`/`upstream.ts`). Non eseguita in questo pass; la mappatura campo-per-campo fra i
due registri e le risposte OpenRouter è nel report di consegna, così un giro dedicato può farlo
deliberatamente invece che dentro un pass già grande.
