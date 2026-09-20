# Le etichette smettono di nominare un fornitore

Restavano sparse le etichette dei trasporti che non usiamo più. Nessuna apriva una connessione —
gli SDK erano già usciti, e `no-side-doors.test.ts` lo tiene — ma ognuna diceva al prossimo lettore
una cosa falsa su dove finisce una chiamata.

**Il criterio: il nome di un MODELLO resta, il nome di un TRASPORTO no.** `Grok 4.6`,
`Gemini 3.1 Flash Image`, `Seedance 2.5` sono modelli che chiediamo al gateway con quei nomi.
`provider: 'kie' | 'gemini' | 'deepseek' | 'xiaomi'` diceva chi serviva la chiamata, e quei quattro
non servono più niente.

Cosa se ne va:

- **`ModelProvider`** in `catalog.ts` — dichiarato, riempito per quattro famiglie e **letto da
  nessuno**. Un campo che nessuno interroga non documenta: fa credere che governi qualcosa.
- **Le union di trasporto** in `chat/model.ts`, `craft-model.ts`, `motion-video/model.ts`,
  `research.ts`. Ognuna elencava fino a cinque fornitori e ne poteva produrre uno.
- **Due branch irraggiungibili** che il compilatore ha trovato appena l'unione si è stretta:
  `modelSeesImages` distingueva chi vede le immagini fra provider che oggi sono uno solo.
- **`noteKieCredits` / `takeKieCredits`** — senza chiamanti da quando il trasporto è uscito.
- **`category_source: 'gemini'`** su `market_posts` → `'model'`. Non dice chi ha servito la
  chiamata, dice **che cosa** ha messo la categoria: un modello invece della query che l'aveva
  indovinata. **Migrazione inclusa, e applicata**: 3.797 righe. Rinominare il codice senza i dati
  avrebbe rimesso quelle righe in coda e le avrebbe fatte rigiudicare, a pagamento.

## Un errore che il test ha preso

Togliendo `provider === 'gemini'` da `computeCostUsd` ho tolto anche il ripiego che prezza una riga
**senza modello**. Non era un fatto del trasporto: il chiamante non ha scritto l'id, ma la chiamata
è stata pagata lo stesso, e senza quel ripiego il costo diventava `null` — cioè «gratis». Il test
che lo teneva esisteva già ed è diventato rosso subito. Ripristinato, ora chiavato su `!entry.model`
invece che su un nome di fornitore.

## Cosa resta, e non è un residuo

`plans.ts` elenca `aiSurfaces: ['chatgpt', 'claude', 'gemini', …]` — sono le superfici su cui il
prodotto misura la visibilità del brand, cioè un dato di prodotto: ChatGPT e Gemini *sono* i posti
dove i clienti vengono citati. E `ai_calls.provider` è `text` senza CHECK, quindi le righe storiche
restano leggibili: il loro `cost_usd` è congelato alla scrittura, non si riprezza mai in lettura.
