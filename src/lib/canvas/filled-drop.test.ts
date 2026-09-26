import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * UN NODO TRASCINATO DA FUORI LA TELA NASCE PIENO, NON VUOTO.
 *
 * `onDrop` deve leggere `CANVAS_DRAG_FILLED_NODE` PRIMA di `CANVAS_DRAG_MEDIUM`: il secondo è il
 * fallback che crea un nodo vuoto, e se la tela lo guardasse per primo un'immagine trascinata
 * dalla libreria degli asset diventerebbe un nodo `image` senza `assetId` — la stessa card vuota
 * di un doppio clic sul menù, con il file già pronto scartato in silenzio.
 *
 * Si legge il sorgente, come gli altri test di `CanvasFlow.svelte`: il difetto è nell'ORDINE in
 * cui due rami vengono provati, non nella forma di un valore che montare il componente potrebbe
 * verificare.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const flow = readFileSync(join(dir, '..', 'components', 'canvas', 'CanvasFlow.svelte'), 'utf8');

describe('il rilascio di un nodo già pieno', () => {
  it('CanvasFlow legge CANVAS_DRAG_FILLED_NODE', () => {
    expect(flow).toMatch(/CANVAS_DRAG_FILLED_NODE/);
  });

  it('onDrop prova il payload pieno prima del fallback vuoto', () => {
    const onDropBody = /function onDrop\(e: DragEvent\) \{([\s\S]*?)\n  \}/.exec(flow)?.[1] ?? '';
    const filledAt = onDropBody.indexOf('CANVAS_DRAG_FILLED_NODE');
    const mediumAt = onDropBody.indexOf('CANVAS_DRAG_MEDIUM');

    expect(filledAt).toBeGreaterThan(-1);
    expect(mediumAt).toBeGreaterThan(-1);
    expect(filledAt).toBeLessThan(mediumAt);
  });

  it('un nodo pieno porta il proprio type e data a chi la monta, non solo un Addable', () => {
    expect(flow).toMatch(/onCreateFilled/);
  });

  it('onDragOver accetta anche il MIME del nodo pieno, o il browser rifiuta il rilascio', () => {
    const onDragOverBody = /function onDragOver\(e: DragEvent\) \{([\s\S]*?)\n  \}/.exec(flow)?.[1] ?? '';

    expect(onDragOverBody).toMatch(/CANVAS_DRAG_FILLED_NODE/);
  });
});
