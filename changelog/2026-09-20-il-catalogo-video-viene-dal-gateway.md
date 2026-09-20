# Il catalogo video viene dal gateway, e i riferimenti arrivano dove devono

Due cose che si tengono: le proprietà dei modelli video non si scrivono più a mano, e i
riferimenti multimodali smettono di sparire sulla strada di OpenRouter.

## Il catalogo, chiesto a chi serve i modelli

`openrouter-video-models.ts` è il gemello di `openrouter-models.ts`, un endpoint più in là:
`/videos/models` pubblica per ciascuno dei 29 modelli video le durate ammesse, i rapporti, le
risoluzioni, se genera audio e quali fotogrammi accetta.

Sono gli stessi fatti che `video-models.ts` teneva riga per riga. Verificato sul gateway vero:

| modello | durate | rapporti | audio | ultimo fotogramma |
|---|---:|---:|:--:|:--:|
| `bytedance/seedance-2.5` | 27 | 6 | sì | sì |
| `x-ai/grok-imagine-video-1.5` | 15 | 7 | no | no |

Due modelli, due insiemi di capacità diversi — che è esattamente ciò che un registro scritto a mano
non può sapere il giorno in cui un provider cambia una durata. Quel giorno non lo comunica nessuno:
il render prende un 422 e sembra un difetto nostro.

Tre regole che il modulo eredita da `openrouter-models.ts`, e che valgono più del risparmio di
righe:

- **Ciò che non c'è non si inventa.** Un modello che il gateway non conosce torna `null`, mai un
  default prudente: un default è una bugia che il provider smentisce dopo che si è già pagato.
- **Un catalogo irraggiungibile non spegne la generazione.** La rete che cade lascia la mappa
  com'era e chi chiama decide; un throw fermerebbe un render che sarebbe partito benissimo.
- **Una risposta vuota non cancella quella buona.** Sostituire un catalogo con niente toglierebbe
  capacità a metà giornata senza che sia cambiato davvero nulla.

## I riferimenti, che su OpenRouter sparivano

`buildOpenrouterVideoInput` costruiva solo `frame_images`. I riferimenti multimodali — le immagini
che ancorano persona e prodotto, la voce da imitare, la clip da rifare — arrivavano **solo a kie**,
e sulla strada di OpenRouter venivano lasciati indietro.

Non falliva: il render riusciva lo stesso, ignorandoli. Una clip UGC usciva senza l'ancoraggio, e
lo si scopriva guardandola.

Ora diventano `input_references`, un elenco solo con i tre tipi che l'SDK dichiara — `image_url`,
`audio_url`, `video_url` — collegato su entrambe le strade, quella inline e quella asincrona.

E la degradazione non la decidiamo più noi. La documentazione dell'SDK: *«Audio and video
references are only honored by providers that support them (including BytePlus Seedance generation
2 and newer); other providers use image references and ignore the rest»*. Oggi quella scelta è un
`if` su `bytedance/seedance-2` dentro `video.ts`; lì è il gateway a farla.

## Una diagnosi sbagliata, e cosa l'ha corretta

Avevo concluso che OpenRouter non reggesse i riferimenti, e mi ero sbagliato **due volte**.

La prima: ho interrogato `/api/v1/models` e ho visto zero modelli video. Quell'endpoint è il
catalogo TESTUALE; i video stanno su `/api/v1/videos/models`, e ce ne sono 29.

La seconda, peggiore: ho cercato nei tipi dell'SDK il campo `referenceImages` — il nome che usa
**kie** — e non l'ho trovato. Il nome vero è `inputReferences`. Le prove sul campo sembravano
confermare: mandavo un `reference_images` con un URL invalido e il gateway accettava. Ma accettava
anche un campo chiamato `pippo_inesistente`: OpenRouter **ignora in silenzio ciò che non conosce**,
quindi stavo misurando il mio errore di nome, non una sua mancanza.

La lezione, che vale oltre questo file: **cercare il nome che usa il vecchio trasporto è il modo
più naturale di non trovare quello nuovo.** E una prova che «passa» su un'API che ignora i campi
sconosciuti non prova niente — il controllo giusto è mandare un campo inventato e vedere se anche
quello passa.

## Quello che questo commit NON fa

kie è ancora lì: `video.ts` ha entrambe le strade, e questo commit le pareggia invece di togliere
la prima. Ora che i riferimenti passano da OpenRouter, la migrazione non perde più capacità — ma
spegnere kie è un passo suo, e va fatto guardando i percorsi che ancora lo nominano (l'upscale,
il riconciliatore, i job in volo).
