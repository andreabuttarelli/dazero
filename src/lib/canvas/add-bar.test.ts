import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * LA BARRA PER AGGIUNGERE UN NODO.
 *
 * Il doppio clic resta, ma da solo non si scopre: niente sulla tela dice che esiste. La barra è
 * la stessa azione resa visibile, e due strade per lo stesso gesto — clic per «mettilo dove
 * capita», trascinamento per «mettilo QUI» — perché su una tela il punto conta.
 *
 * Il clic e il trascinamento devono finire nella STESSA funzione di creazione: due strade che
 * costruiscono il nodo per conto loro divergono al primo campo aggiunto, e il difetto si vede
 * solo su una delle due.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const bar = readFileSync(join(dir, '..', 'components', 'canvas', 'CanvasAddBar.svelte'), 'utf8');
const flow = readFileSync(join(dir, '..', 'components', 'canvas', 'CanvasFlow.svelte'), 'utf8');

describe('la barra per aggiungere un nodo', () => {
  it('offre tutto ciò che si può aggiungere, preso dal modello e non riscritto', () => {
    // `CANVAS_ADDABLE` e non `GEN_MEDIUMS`: la barra mostra anche la pagina incorporata, che non
    // produce niente. Un elenco riscritto qui perderebbe la quarta voce senza che nulla lo dica.
    expect(bar).toMatch(/CANVAS_ADDABLE/);
  });

  it('ogni voce si può cliccare', () => {
    expect(bar).toMatch(/onclick=/);
  });

  it('ogni voce si può trascinare sulla tela', () => {
    expect(bar).toMatch(/draggable/);
    expect(bar).toMatch(/ondragstart=/);
  });

  it('dice cosa sta viaggiando, o la tela non saprebbe cosa creare', () => {
    expect(bar).toMatch(/setData\(/);
  });

  it('ha un nome accessibile: sono icone, e un bottone muto non si legge', () => {
    expect(bar).toMatch(/aria-label|title=/);
  });

  it('sta in basso al centro e allinea in fila, non verticale a sinistra', () => {
    expect(bar).toMatch(/bottom:/);
    expect(bar).toMatch(/left:\s*50%/);
    expect(bar).not.toMatch(/flex-direction:\s*column/);
  });

  it('il nome compare come tooltip SOPRA l\'icona, non come testo sempre visibile', () => {
    // Il testo esiste (`ADDABLE_LABEL[what]`) ma è nascosto finché non si passa sopra l'icona:
    // `opacity: 0` di riposo, `opacity: 1` solo su `:hover`/`:focus-visible`. `bottom: calc(100% …`
    // lo ancora sopra l'icona — sotto uscirebbe dal riquadro, dato che la barra tocca già il
    // fondo della tela.
    expect(bar).toMatch(/opacity:\s*0;/);
    expect(bar).toMatch(/:hover[\s\S]{0,80}opacity:\s*1/);
    expect(bar).toMatch(/\.add-tip\s*\{[^}]*bottom:\s*calc\(100%/);
  });

  it('offre un modo di caricare un file, oltre a scegliere fra ciò che nasce già pieno', () => {
    expect(bar).toMatch(/type="file"/);
    expect(bar).toMatch(/onupload/);
  });
});

describe('la tela che riceve il trascinamento', () => {
  it('accetta il rilascio, che senza `preventDefault` il browser rifiuta', () => {
    expect(flow).toMatch(/ondragover=/);
  });

  it('crea il nodo nel punto in cui è stato lasciato', () => {
    expect(flow).toMatch(/ondrop=/);
    // Lo stesso `toFlow` del doppio clic: un secondo calcolo delle coordinate sarebbe un secondo
    // posto in cui sbagliarle.
    expect(/function onDrop[\s\S]*?toFlow\(/.test(flow)).toBe(true);
  });

  it('monta la barra sopra la tela', () => {
    expect(flow).toMatch(/<CanvasAddBar/);
  });
});
