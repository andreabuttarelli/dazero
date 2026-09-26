import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CANCELLARE ERA SCOLLEGATO, E IL NODO TORNAVA IN SCENA.
 *
 * `deleteCanvasItems` e `deleteCanvasEdge` erano scritti e verdi, le action `remove` e
 * `disconnect` c'erano, `CanvasKeys` esponeva `ondelete` — e nessuno lo passava. ⌫ toglieva il
 * nodo dallo stato interno di SvelteFlow, la riga restava nel database, e alla prima
 * riconciliazione `syncNodes` lo rimetteva dentro perché `tiles` lo conteneva ancora. Il difetto
 * che si vedeva era «il nodo torna da solo»: nessuno dei due pezzi, da solo, poteva accorgersene.
 *
 * Si legge il SORGENTE per la stessa ragione di `connect-wiring.test.ts`: un filo staccato non è
 * un difetto di logica, è un difetto di collegamento, e ogni estremo passa i propri test.
 */
const dir = dirname(fileURLToPath(import.meta.url));

const canvasSrc = (name: string) =>
  readFileSync(join(dir, '..', 'components', 'canvas', name), 'utf8');

const flow = canvasSrc('CanvasFlow.svelte');
const keys = canvasSrc('CanvasKeys.svelte');

const canvasPage = (name: string) =>
  readFileSync(join(dir, '..', '..', 'routes', 'p', '[projectId]', 'c', '[canvasId]', name), 'utf8');

const page = canvasPage('+page.svelte');
const server = canvasPage('+page.server.ts');

describe('il gesto di cancellare arriva fino alla riga', () => {
  it('la tela passa alla tastiera chi sa togliere una tile', () => {
    // Senza questa prop `RUN.delete` chiama un `ondelete` che non esiste: SvelteFlow toglie il
    // nodo dal proprio stato, la riga resta, e `syncNodes` lo rimette dentro al battito dopo.
    expect(flow).toMatch(/<CanvasKeys[\s\S]*?ondelete=\{/);
  });

  it('la tela chiede fuori di togliere le tile, invece di deciderlo da sé', () => {
    expect(flow).toMatch(/onDelete\?:/);
  });

  it('la libreria non cancella per conto suo, o è lei a far tornare il nodo', () => {
    // `deleteKey` vale 'Backspace' di default e `KeyHandler` chiama `deleteElements`: il nodo
    // sparisce dal solo stato di SvelteFlow, la riga resta, e `syncNodes` lo riporta dentro.
    // È il meccanismo esatto del «torna in scena», e si spegne da qui.
    expect(flow).toMatch(/deleteKey=\{null\}/);
  });

  it('la pagina toglie le tile dal PROPRIO stato, o la riconciliazione le riporta', () => {
    expect(page).toMatch(/onDelete=\{/);
    expect(page).toMatch(/post\('remove'/);
  });

  it('e le linee della tela le può togliere davvero', () => {
    expect(page).toMatch(/onEdgeDelete=\{/);
    expect(page).toMatch(/post\('disconnect'/);
  });

  it('le action che cancellano ci sono entrambe, e il server le conosce', () => {
    expect(server).toMatch(/remove: async/);
    expect(server).toMatch(/disconnect: async/);
  });

  it('la tastiera non decide da sé: chiede a chi ha la riga', () => {
    expect(keys).toMatch(/ondelete\?:/);
  });

  it('⌫ prende anche la linea selezionata, non solo i nodi', () => {
    // Una linea si seleziona cliccandola, e SvelteFlow la marca come marca un nodo: leggere
    // solo `getNodes` lascia ⌫ senza effetto su di lei, che è lo stesso difetto visto da un
    // altro lato — «cancellare non funziona».
    expect(keys).toMatch(/getEdges/);
  });
});
