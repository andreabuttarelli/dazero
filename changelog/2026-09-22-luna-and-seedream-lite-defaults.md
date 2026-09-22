# Il default cambia: GPT-5.6 Luna per il testo, Seedream 5 Lite per le immagini

L'utente ha chiesto due default nuovi e uno tolto: `openai/gpt-5.6-luna` per la chat, Seedream 5
Lite (non Pro) per le immagini, e via `google/gemini-3-pro-image` da quel ruolo — "non voglio
gemini-3-pro-image".

## Cosa decide il default, per ciascuno dei due mestieri

**Chat**: `chat_model_catalog.is_default` (una riga sola, un trigger la tiene tale). La tabella
non esiste ancora in produzione — questo repo non applica le migration al deploy, vedi
`CLAUDE.md` — quindi finché `20260902170000_chat_model_catalog.sql` e
`20260902180000_chat_model_default.sql` non girano, il default vivo resta `LLM_DEFAULT_MODEL`
(env, fuori da questo cambio). `openai/gpt-5.6-luna` era già seminato in catalogo (posizione 60);
la nuova migration `20260922190000_gpt_5_6_luna_default.sql` accende solo `is_default`.

**Immagine**: ordine dell'array `SPECS` in `image-models.ts`. `GenNode.svelte` prende
`choices[0]` quando il nodo non ha un modello scelto, e `choices` è `IMAGE_MODEL_CHOICES` filtrato
da `offerableModels()` sui synced di `ai_models`, nello stesso ordine dell'array — niente
`isDefault` in più da tenere allineato, il primo elemento offerable vince.

## Perché Lite e non Pro, e perché Pro resta

Il coordinatore ha corretto la richiesta a metà lavoro: Lite come default, Pro tenuto selezionabile
perché lo spec era già stato scritto e toglierlo sarebbe stato lavoro perso per nessun motivo — un
default più economico con il modello migliore ancora disponibile è la forma giusta.

`bytedance-seed/seedream-5-0-pro` e `bytedance-seed/seedream-5-0-lite` pubblicano, su
`/images/models`, lo stesso `supported_parameters`: `resolution, aspect_ratio, n,
input_references, seed` — nessun tetto numerico, nessun elenco di rapporti, **nessun prezzo**
(`pricing: {}` su ENTRAMBE le righe, verificato in query diretta sul progetto
`klnswzhhgrqvbfjzioul`). Non è un buco: `ImageModelSpec` non ha mai avuto un campo prezzo — il
costo di un'immagine OpenRouter viene da `usage.cost` della singola chiamata
(`openrouter-images-api.ts`), fatturato per quello che è successo, non stimato da uno spec. Lite e
Pro ereditano quindi lo stesso `maxRefs`/rapporti già misurati per Pro: stesso contratto di
trasporto, la differenza fra le due taglie è qualità/costo a runtime, non forma della richiesta.

## Gemini: tolto dal default, non dallo spec

`nano-banana-pro` (`google/gemini-3-pro-image`) resta in `SPECS`, spostato via dalla prima
posizione. Verificato prima di decidere: zero righe in `node_runs`/`ai_calls` referenziano
`gemini-3-pro-image`/`nano-banana-pro` in produzione, e `brands.content_prefs` non esiste ancora
live — cancellare lo spec non avrebbe rotto nessun nodo salvato oggi, ma tenerlo selezionabile
costa una riga e compra la stessa sicurezza per quando quella colonna arriverà.
