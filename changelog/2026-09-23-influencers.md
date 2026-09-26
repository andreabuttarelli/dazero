# Gli influencer tornano, ricostruiti sullo schema nuovo

`talent`/`talent_views` (54 volti, 378 viste) erano il catalogo di anomalia, cancellato oggi
insieme al resto del prodotto vecchio perché scritto per tabelle che non esistono più nel
database nuovo. L'utente li vuole indietro: volti riusabili che restano coerenti fra immagini e
video generati, dentro un nodo canvas solo.

## Cosa già esisteva

Il disegno del nodo canvas (`nodes.type`, `nodes.data` jsonb, il CHECK generato da
`looseNodeJsonSchema`) e il resolver `upstream-inputs.ts` — ma quest'ultimo assumeva un nodo
sorgente con UNA immagine (`mediaUrl`), mai una lista. Un influencer ne porta 7.

## Cosa è cambiato

- **Schema** (`supabase/canvas-migrations/20260922_influencers.sql`, `20260922_influencer_bucket.sql`,
  pending — non applicata): `influencers` (`org_id` **nullable**, l'unica deviazione dalla regola
  "org_id NOT NULL ovunque" — `null` è il catalogo globale) e `influencer_views`. RLS: lettura al
  catalogo o alla propria org, scrittura solo alla propria org — il catalogo lo scrive solo lo
  script di import con la service-role key. Bucket `influencers`, due forme di percorso
  (`catalogue/<id>/…` letto da chiunque, `<orgId>/<id>/…` dalla propria org).
- **`upstream-inputs.ts`**: `UpstreamNode.mediaUrls` (plurale) accanto a `mediaUrl` — un nodo con
  più immagini le porta tutte su un arco solo, ognuna contro il tetto (`maxRefs`) del modello a
  valle, con lo stesso `rejected` di sempre per quelle in eccesso. `upstream.ts` (l'adattatore che
  legge dal database vero) è stato aggiornato PARI PASSO: senza, il resolver avrebbe accettato
  `mediaUrls` in teoria e non li avrebbe mai visti in pratica — un test sulla funzione pura non lo
  avrebbe scoperto, e infatti non lo ha scoperto finché non è arrivato un test sull'adattatore.
- **Nodo `influencer`**: `src/lib/canvas/node-data.ts` (`{influencer_id: string}`), `InfluencerNode.svelte`
  (sola lettura — nasce pieno da un trascinamento, non si modifica dopo), registrato nella pagina
  canvas insieme a `products`/`social_account_feed`.
- **Creazione**: `scripts/import-anomalia-talents.ts` (idempotente, `--dry-run`) porta i 54 talent
  nel catalogo globale. `/p/[projectId]/influencers` genera un nuovo influencer con un builder a
  categorie (specie, genere, etnia, capelli, corna…) portato da un altro repo (`dalnulla`) e
  riscritto sulle convenzioni di questo — il volto frontale prima, le altre 6 viste dopo con quello
  come riferimento — oppure da foto caricate, col consenso obbligatorio sulla riga. "Usa come
  modello" clona gli attributi di un influencer esistente nel builder.
- **MCP**: `describe_node_types` conosce il decimo tipo.

## Cosa NON è cambiato

`CanvasFlow.svelte` e `connect-rules.ts`: entrambi già trattavano un tipo sconosciuto in modo
generico (rifiuto pulito, non un crash), quindi un decimo tipo di nodo non ha richiesto un `if` in
più — la stessa cosa che serviva già a `products`/`social_account_feed`.

## Cosa manca ancora

La migration non è applicata — nessuna riga esiste finché non lo è. Il pannello Influencers nella
rail è cablato (`shell-nav.ts`, `CanvasLeftPanel.svelte`) ma non ancora provato contro il database
vero per lo stesso motivo.
