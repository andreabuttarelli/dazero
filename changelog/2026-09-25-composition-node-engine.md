# Composizione: il motore di scena, fase 1 di 4

## Perché

La Composizione è il quarto nodo generativo: più media (immagini o video) disposti in una scena
3D animata, con camera e layout, esportabile in video. Il prodotto finale ha un editor
(anteprima 3D a sinistra, parametri a destra, come Effetti), layout multipli, keyframe camera ed
export MP4 via WebCodecs. Questa fase costruisce solo il motore — nessuna UI di prodotto, nessun
nodo sulla tela.

## Cosa

`src/lib/canvas/composition/`:

- `types.ts` — `Vec3`, `Transform`, `LayoutParam` (stessa forma di `effects/types.ts`: range/
  select/color/seed), `LayoutId`.
- `clamp.ts` — `clampParams`, condivisa da layout e camera: un parametro fuori range non produce
  mai una posizione assurda, lo clampa in un solo posto.
- `tilted-grid.ts` / `carousel-3d.ts` — `transforms(count, params, t) → Transform[]`, pure,
  senza Three.js: testabili in Node. Griglia obliqua con colonne/righe, gap, tilt XYZ, scroll
  con direzione e wrap implicito nel modulo del tempo; carosello con raggio, scala fronte/retro,
  profondità, velocità di rotazione e una `easeStop` che rallenta il passaggio da un elemento
  all'altro invece di scorrere a velocità costante.
- `index.ts` — `LAYOUTS` (id → etichetta italiana, params, transforms) e `layoutAt`.
- `camera.ts` — `CameraState`, quattro preset (`static`, `slow-orbit`, `push-in`, `dolly`) come
  `cameraAt(id, params, t)`, e `interpolateKeyframes` con easing lineare o ease-in-out da una
  piccola tabella, non da un `if` per tipo.
- `scene.ts` — l'unico file che importa Three.js: `createCompositionScene(canvas, opts)` monta
  un piano texturizzato per media (texture immagine, o `HTMLVideoElement` muto e in loop per i
  video), applica `layoutAt` + `cameraAt` a ogni `renderAt(t)`. Le texture caricano da URL
  same-origin (la rotta asset del canvas) perché l'export futuro non deve trovarsi un canvas
  "tainted".
- `src/routes/dev/composition/` — pagina solo-dev (404 fuori da `dev`, guardia in
  `+page.server.ts`) con tile placeholder generate a canvas, select layout/camera, slider
  parametrici generati dalla tabella, scrubber del tempo. È la prova di fase 1 e il seme
  dell'editor di fase 2.

## Isolamento del bundle

Nessun file fuori da `canvas/composition/` importa quel pacchetto tranne la pagina dev, e lì
`scene.ts` (l'unico a importare `three`) entra con un `import()` dinamico dentro `rebuildScene`,
non con un import statico. La tela principale (`/p/[projectId]`) non referenzia mai
`canvas/composition`: `three` non può finire nel suo bundle finché una fase successiva non ci
mette un nodo o un editor.

## Scartato

Un singolo file `griglia.ts` con `if (id === 'carousel')`: la stessa esigenza di `EFFECTS` in
`effects/index.ts` — un file per layout, una tabella che li elenca, non un ramo che cresce a ogni
nuovo layout.

## Prossime fasi (non in questo commit)

Nodo `composition` sulla tela, editor con anteprima 3D reale al posto della pagina dev,
export MP4/still via WebCodecs.
