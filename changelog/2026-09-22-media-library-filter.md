# La libreria media di un progetto legge `assets`, con un filtro sorgente

`/p/[projectId]/media` era ancora sullo schema vecchio — `brand_media`, `listBrandMedia`,
tag e catalogazione AI per soggetto/mood. La tela nuova (`/p/[projectId]/c/[canvasId]`) deposita
già ogni generazione e ogni upload in `assets` (`canvas/generate.ts`, `canvas/upload.ts`), ma
niente la mostrava per progetto: la vetrina restava sulla tabella sbagliata.

## Cosa già esisteva

`source`/`source_node_id` erano già la meccanica giusta — `NEW_DATABASE_STRUCTURE.md` lo dice
esplicitamente. `depositText`/`depositImage` in `canvas/generate.ts` scrivevano già
`source: 'generated'` con `project_id` e `source_node_id`; `uploadCanvasAsset` in
`canvas/upload.ts` scriveva già `source: 'upload'`. Non c'era un buco nel deposito — c'era un
buco nella lettura.

## Cosa è cambiato

- `listProjectAssets` (`repos/assets.ts`) accetta ora un `source` opzionale: il filtro sta nella
  query (`.eq('source', ...)`), non in un `.filter()` lato client — un progetto accumula
  migliaia di asset.
- `listNodesByIds` (`repos/canvas.ts`), nuova: da un elenco di id di nodo ai nodi, senza passare
  per un canvas — la libreria guarda tutto il progetto, non una tela sola, e serve per risalire
  dall'asset al nodo che l'ha generato.
- `signAssetFiles` (`repos/asset-storage.ts`), nuova: firma in blocco i path di `canvas-assets`,
  come `signKnowledgePaths` già fa per `brand-knowledge` — un asset generato e uno caricato
  vivono in bucket diversi, e la pagina ne firma decine in un colpo solo.
- `/p/[projectId]/media/+page.server.ts` e `+page.svelte`: riscritti sullo schema nuovo, filtro
  `all` / `generated` / `upload` come query param (`?source=`), ogni tile porta un link al nodo
  che l'ha generato quando `source_node_id` esiste ancora.

## Cosa NON è cambiato

Niente cartelle, niente tag: `source='generated'` È il raggruppamento, il filtro è la vetrina su
quella colonna. Il workbench (`/p/[projectId]/workbench`, `brand_canvas_items`/`brand_media`)
resta sullo schema vecchio — non è stato toccato, e la sua pagina media
(`/p/[projectId]/media` prima di questo commit) era in realtà LA STESSA rotta: il progetto e il
workbench condividevano l'URL. Un progetto aperto dal workbench oggi vede la libreria nuova, che
per un progetto senza canvas nuovo sarà vuota — il primo posto dove questo si nota.

## Un difetto preso e chiuso nello stesso giro

`+page.server.ts` esportava anche `parseAssetSourceFilter` per testarla: SvelteKit accetta solo
un elenco fisso di export da un file di rotta, e un export in più fa cadere la rotta INTERA con
un 500 generico, anche per chi non è autenticato — non un errore a runtime nella logica, un
errore al caricamento del modulo. Spostata in `asset-filter.ts`, un file che non è una rotta.
Il test l'ha vista cadere prima del fix (`curl` sulla rotta tornava 500 invece del redirect a
`/login` che la stessa richiesta ottiene su ogni altra pagina di progetto).
