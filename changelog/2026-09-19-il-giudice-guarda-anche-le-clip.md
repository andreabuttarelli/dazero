# Il giudice guarda anche le clip

Il mestiere della resa UGC è entrato nei brief senza un modo di sapere se serve. `clip-craft-review.ts`
è il gemello del giudice fotografico, un medium più in là: guarda il video reso e dice quali fatti
mancano.

Sei controlli, uno per ogni difetto che `UGC_CRAFT_SPECS` promette di evitare:

| id | cosa cerca |
|---|---|
| `hand-count` | una terza mano, un braccio duplicato, dita in più — anche per un solo istante |
| `no-teleport` | un oggetto che cambia posto senza un movimento che ce lo porti |
| `lip-sync` | labbra che si muovono senza voce, o che continuano dopo la battuta, o che sbavano |
| `no-burned-text` | sottotitoli, watermark, loghi, lettere cotte nel fotogramma |
| `product-identity` | il prodotto che cambia forma o colore fra uno stacco e l'altro |
| `no-frozen-beat` | un tratto di clip in cui niente si muove, come un fermo immagine stirato nel tempo |

## Il video intero, non i fotogrammi

`llmStructured` accetta un `file` con `mediaType: 'video/mp4'` — la stessa strada che
`motion-references.ts` usa da tempo per studiare le clip di mercato.

Non è un dettaglio di trasporto: **metà di questi difetti esiste solo nel tempo.** Un teletrasporto
non si vede in un fotogramma, si vede fra due. Una battuta congelata è una serie di fotogrammi
identici, e uno solo di quelli sembra a posto.

## Non è un cancello, e qui costa ancora di più

Come per le immagini: il verdetto **non ha un `pass`**, e un test lo fissa. Ma sulla clip la ragione
pesa di più — una clip costa molto più di un'immagine, e scartarla su un giudizio estetico
brucerebbe il budget video di un brand in un pomeriggio.

Un giro non eseguito lo dichiara (`checked: 0` più `unrun`) invece di sembrare un pieno di successi,
e gli id che il modello inventa vengono scartati prima del conto.

## `reviewClipAt`: la porta da cui si entra davvero

`reviewClipCraft` prende dei byte, ma `renderVideo` restituisce una **URL**: senza una seconda porta
il giudice sarebbe inutilizzabile proprio da chi rende.

`reviewClipAt` scarica e giudica, con tre rifiuti che dichiarano invece di rompere: una risposta che
non è un video, una clip oltre i 40 MB, una rete che cade. Il peso dichiarato si guarda **prima** di
leggere il corpo — dopo, il file è già in memoria e il controllo non ha protetto niente.

`fetchImpl` è iniettabile perché la rete è l'unica cosa qui che non si può far fallire a comando, ed
è anche quella che fallisce più spesso.

## Quello che questo commit NON fa

Non misura ancora niente: lo strumento c'è, ma nessuna sonda rende clip. `eval:creative` fa immagini
e si ferma lì, e una sonda video costa molto più di una fotografica — è una decisione di budget, non
di codice.

Quindi il craft UGC resta scritto bene e non ancora dimostrato. La differenza con ieri è che adesso
la domanda «è migliorato?» ha uno strumento per rispondere, invece di un parere.
