/**
 * LA FORMA DI UNA RICHIESTA IMMAGINE, senza il fornitore che la serve.
 *
 * Viveva in `kie-jobs.ts`, e da lì la importavano anche i due trasporti OpenRouter: cancellare quel
 * file avrebbe rotto in compilazione proprio le strade che dovevano restare. Il tipo non è di nessun
 * fornitore — è ciò che `buildImageRequest` produce — quindi sta in un modulo che non ne nomina
 * nessuno.
 */
export type GeminiImageRequest = {
  model: string;
  contents: Array<{
    parts: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
    }>;
  }>;
  /** Il token esatto che il modello scelto dichiara (`ai_models.supported_resolutions`,
   *  `ModelChoice.resolutions`) — `1K`/`2K`/`4K` per la maggior parte, `512` in più su Nano
   *  Banana 2. Solo `/api/v1/images`, solo i modelli che dichiarano `resolution` fra i
   *  `supported_parameters`. Assente = la resa di default del modello. */
  config?: {
    imageConfig?: {
      aspectRatio?: string;
      resolution?: string;
      /** I campi che il modello scelto dichiara oltre a formato e risoluzione
       *  (`ai_models.param_schema`, `ModelChoice.params`) — `quality`, `background`,
       *  `output_compression`… Già filtrati a monte (`model-params.ts::modelParamsOf`
       *  esclude quel che ha un controllo suo), spediti qui col loro nome esatto. */
      params?: Record<string, unknown>;
    };
  };
};
