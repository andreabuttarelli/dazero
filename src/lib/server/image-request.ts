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
  /** '1K' | '2K' | '4K' — solo `/api/v1/images`, solo i modelli che lo dichiarano fra i
   *  `supported_parameters`. Assente = la resa di default del modello. */
  config?: { imageConfig?: { aspectRatio?: string; resolution?: string } };
};
