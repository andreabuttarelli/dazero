import { startMockZernio, type MockZernio } from './mock-zernio';

/**
 * Il webServer di Playwright parte UNA volta, prima di ogni spec: il mock Zernio deve già
 * ascoltare quando `vite dev` legge `ZERNIO_BASE_URL` (playwright.config.ts la passa solo se
 * `process.env.ZERNIO_BASE_URL` è già valorizzata QUI, prima che `webServer` parta — dopo è
 * tardi, l'ambiente del processo figlio è già congelato).
 *
 * Porta fissa, non casuale: `globalTeardown` gira in un processo diverso e deve trovare lo stesso
 * server per chiuderlo — una porta scelta a caso qui andrebbe comunicata altrove per essere
 * richiusa, e non c'è un canale per farlo fra due processi Node separati.
 */
const MOCK_ZERNIO_PORT = 4499;

/** Il valore di ritorno è la funzione di teardown: Playwright la chiama da sola a fine corsa —
 *  un file solo, un'esportazione sola, niente da tenere sincronizzato con globalTeardown. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const mock = await startMockZernio(MOCK_ZERNIO_PORT);
  // Nessun suffisso /api/v1: zfetch concatena baseUrl() + path senza aspettarsi una forma
  // precisa, e il mock risponde direttamente su /posts, /posts/:id.
  process.env.ZERNIO_BASE_URL = mock.url;

  return () => mock.close();
}
