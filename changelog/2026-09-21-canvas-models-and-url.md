# La tela vede tutti i modelli, e non sta più sotto /app

## Perché

Due cose che si sono viste usando la tela: il menù del modello su un nodo era vuoto (la pagina
non chiamava il catalogo — il workbench vecchio sì, per quello lì funzionava), e per il testo
chiedeva `usableGatewayModels`, cioè i soli modelli con tool-calling e immagini in ingresso:
quelli servono a un agente, non a chi scrive un prompt su una tela. La lista completa di
OpenRouter era 443 voci contro poche decine.

L'indirizzo `/app/c/<id>` portava un prefisso che non dice più niente: la tela non è più una
pagina dentro il prodotto vecchio.

## Cosa

- `gatewayModels()` in `openrouter-models.ts`: l'intero listino, accanto a `usableGatewayModels()`
  che resta quello da agente. Due funzioni perché sono due domande diverse.
- `canvasModelCatalogue()` usa `gatewayModels()` per il testo. Immagine e video restano su
  `media-model-slots`, che è l'unico posto che sa formati e durate.
- La `load` della tela ritorna `catalogue`, e `GenNode` riceve `choices={catalogue[gen.medium]}`.
  Prima la prop esisteva e non arrivava niente: il menù si disegnava su una lista vuota.
- `/app/c/` → `/c/`, con la sua `+layout.svelte` (Tailwind, come /app) e `canvasPath` allineato.

## Scartato

Allargare `usableGatewayModels` a tutti: sarebbe servito al picker degli agenti una lista piena
di modelli che non sanno chiamare tool, e il turno morirebbe a metà. Le due domande restano
separate.

## Verifica

`canvas-catalogue.test.ts` passa da rosso a verde sul testo che deve essere l'intero listino
(comprese le voci `usable: false`), e il carico reale dal gateway dà 443 / 8 / 7.
