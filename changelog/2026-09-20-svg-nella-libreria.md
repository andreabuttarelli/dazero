# Gli SVG entrano nella libreria, e il controllo passa nell'header

## Quello che ho trovato, che non è quello che sembrava

Il segnaposto sembrava un guasto del rendering. Non lo era: entrambe le pagine disegnano già
`<img src={signed_url}>` quando `kind === 'image'`, e un SVG quel ramo lo prende. Verificato sul
vero: i 12 SVG in `brand_media` (brand `nebulae-verify`, tile del canvas-seed) hanno riga completa
con 600×600 e `catalog_status = ready`, i file stanno nel bucket `brand-knowledge` con
`mimetype = image/svg+xml`, e l'URL firmato torna **200** con markup valido e autosufficiente.

Il difetto vero sta **prima**, nell'upload: `isRasterOrVideoFile` dava falso per un SVG —
`sniffRasterKind` non lo conosce e torna `unknown` — e il ciclo faceva `continue`. Nessun errore,
nessuna riga, nessun file. Un SVG scelto dal picker **spariva in silenzio**, e il segnaposto che
si vedeva era di un media senza URL, non di un SVG disegnato male.

## Un SVG non è un raster, e gli helper non devono dire che lo sia

`sniffRasterKind` continua a chiamarlo `unknown`: nessuna conversione JPEG lo tocca, e fargli
dire il contrario romperebbe `jpegIfHeicFile`. Quello che cambia è chi decide se un file si può
caricare — `isUploadableMediaFile`, che è raster **o** video **o** vettoriale. Il cancello e la
conversione erano la stessa domanda, e non lo sono.

Tre dettagli che senza il giro vero non si vedono:

- **Il mime vuoto.** Alcuni browser danno `type: ''` per un `.svg` preso dal disco. Senza un
  ripiego il file partirebbe come `octet-stream` e il server lo rifiuterebbe per mime non-immagine:
  un secondo scarto silenzioso subito dopo aver tolto il primo.
- **Le misure.** `createImageBitmap` rifiuta un SVG; le dimensioni si leggono dal `viewBox`, che è
  dove un vettoriale le dichiara.
- **`.svg` nell'accept.** `image/*` lo copre sulla carta, ma alcune finestre di sistema filtrano
  sull'estensione e il file non sarebbe nemmeno selezionabile.

## Contenuto, non ritagliato

Un vettoriale è quasi sempre un logo: `object-fit: cover` gli taglia via il senso, e uno con lo
sfondo trasparente sparirebbe sulla tessera scura. Quindi `contain`, un po' di padding e carta
sotto — sulla griglia dei media, sull'anteprima e sulle tile della tela.

## Il controllo nell'header

Era sopra la lista e si prendeva una fascia di altezza al contenuto. Ora sta a destra nell'header,
sulla riga che il marchio occupa già: testo a 10,5px, padding 2,5×7. Sul rail collassato da
3.25rem sparisce, che è dove stava anche prima.

## Quello che resta non verificato

Il caricamento di un SVG dal picker **non è stato provato nel browser**: la build di `main` è rotta
da prima di questo branch (`onboarding-steps.ts:1106` e `@vercel/nft`), quindi il dev server non
parte. I test coprono il cancello, il riconoscimento e l'accept; non coprono un file vero che
attraversa Storage.
