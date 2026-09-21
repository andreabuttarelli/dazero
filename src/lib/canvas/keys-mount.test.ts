import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * L'ASCOLTATORE DELLA TASTIERA, MONTATO DOVE PUÒ FUNZIONARE.
 *
 * Zoom, inquadratura e stato dei nodi arrivano da `useSvelteFlow`, che legge il contesto che solo
 * `SvelteFlow` apre: montato FUORI, il componente si compila, non esplode, e non fa niente —
 * esattamente il difetto già pagato da `CanvasPointer`, che per questo vive dentro.
 *
 * Si legge il sorgente perché il difetto è di POSIZIONE nell'albero, non di logica: montare il
 * componente direbbe che non è esploso, non che i tasti arrivano a una tela vera.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const read = (name: string) =>
  readFileSync(join(dir, '..', 'components', 'canvas', name), 'utf8');

const flow = read('CanvasFlow.svelte');
const keys = read('CanvasKeys.svelte');

describe('le scorciatoie della tela', () => {
  it('stanno dentro SvelteFlow, o il contesto non c’è', () => {
    const inside = /<SvelteFlow[\s\S]*?<\/SvelteFlow>/.exec(flow)?.[0] ?? '';
    expect(inside).toMatch(/<CanvasKeys/);
  });

  it('decidono col registro, non con una catena di `if` nel componente', () => {
    // Un `e.key === …` scritto qui è la regola scritta due volte: il registro e la scheda di
    // aiuto direbbero una cosa e i tasti un'altra, e a divergere sarebbe quella che si legge.
    expect(keys).toMatch(/matchCanvasShortcut/);
    expect(keys).not.toMatch(/e\.key === '/);
  });

  it('chiedono alla tela vera zoom e inquadratura', () => {
    expect(keys).toMatch(/useSvelteFlow/);
    expect(keys).toMatch(/fitView/);
    expect(keys).toMatch(/zoomIn/);
    expect(keys).toMatch(/zoomOut/);
  });

  it('non intercettano l’evento che il registro ha lasciato passare', () => {
    // `preventDefault` sotto CONDIZIONE, mai nudo: chiamato prima del riconoscimento mangia il
    // Backspace di chi scrive in un prompt, e su Esc lo ruba al menù del doppio clic — due
    // difetti che si vedono solo usando la tela, quindi si guardano da qui.
    const body = keys.slice(keys.indexOf('function onKeydown'));
    expect(body).toMatch(/if \(!command\) return;/);
    expect(body).toMatch(/if \(preventable\(command\)\) e\.preventDefault\(\);/);
  });

  it('la barra dice quale tasto fa cosa, o nessuno le trova', () => {
    // La scheda `?` le elenca, ma la si apre solo sospettando che esistano: il numero accanto
    // all'etichetta è l'unico posto in cui la scorciatoia si incontra senza cercarla.
    const bar = read('CanvasAddBar.svelte');
    expect(bar).toMatch(/title=\{`\$\{ADDABLE_LABEL\[what\]\} \(\$\{i \+ 1\}\)`\}/);
  });
});
