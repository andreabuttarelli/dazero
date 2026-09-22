# Content si genera sulla tela, non più fuori

`generate_image`, `generate_video`, `generate_carousel`, `refine_media`, il vecchio
`generate_media` e `render_post`: sei tool MCP e le loro rotte REST, cancellati insieme al motore
che li serviva. Il canvas (`run_node_generation`) è l'unico modo di generare contenuto ora.

## Cancellato

- `src/lib/server/content-preview.ts` e tutto `src/lib/server/content-preview/`: `images.ts`
  (motore di render, vedi sotto), `seed-model.ts`, `caption-quality.ts`, `regenerate-post.ts`,
  `render-preview.ts`, `standalone-image.ts`, `default-image-model.ts`.
- `src/lib/server/carousel-generate.ts`, `carousel-craft.ts`: il loro unico chiamante era il job
  carosello di `media-generate.ts`.
- Rotte: `brands/[slug]/media/{generate,carousel,images,videos,refine}`, e le gemelle senza
  brand `/api/v1/{images,videos,refine,carousel}`. `media/+server.ts` (list/import) resta:
  `list_media`/`import_media_url` non generano niente.
- Da `media-generate.ts`: `generateBrandImages`, `generateBrandVideo`, `generateBrandMedia`,
  `refineBrandMedia`, `refineMediaWithoutBrand`, il job carosello (`runCarousel`,
  `generateBrandCarousel`, `generateCarouselWithoutBrand`), `listMediaJobs`, `listOrgMediaJobs`.
  Ogni chiamante era una delle rotte sopra.
- Contratti: `GENERATE_IMAGE`, `GENERATE_VIDEO`, `GENERATE_CAROUSEL`, `GENERATE_MEDIA`,
  `REFINE_MEDIA`, `CHECK_MEDIA_JOB_READ`, `RENDER_POST`, `MAX_MEDIA_ALTERNATIVES`.

## Spostato, non cancellato

Il motore di render (`renderPostImage`, `buildImageRequest`, `loadBrandVisualContext`) è l'unica
cosa che il canvas usava da `content-preview/images.ts`. È diventato `media-generate.images.ts`
(+ `media-generate.image-model.ts` per `defaultImageModel`), proprietà di `media-generate.ts`:
`generateImagesWithoutBrand` e `generateVideoWithoutBrand`, le due funzioni che il canvas chiama
davvero (`canvas/generate.ts`), restano. Anche `website-capture.ts`, `people.ts` e
`brand-media.ts` — che condividevano lo stesso motore, non solo `content-preview` — sono stati
ripuntati sulla nuova sede.

## Trovato ma non toccato

`src/lib/server/ads-remix.ts` → `produceRemixBrief` mandava in coda `chat_jobs` con
`tool_name: 'ugc_batch'` e poi un POST a `/api/v1/designer/work` — una rotta che non esiste già
da prima di questo giro. Il bottone "produce" della libreria ads era già rotto (coda mai
processata, POST silenziosamente ignorato); il motion-video/designer che l'agente parallelo ha
cancellato in questo stesso giro è la causa.
