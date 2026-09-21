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
  it('offre i tre medium, presi dal modello e non riscritti', () => {
    expect(bar).toMatch(/GEN_MEDIUMS/);
  });

  it('ogni voce si può cliccare', () => {
    expect(bar).toMatch(/onclick=/);
  });

  it('ogni voce si può trascinare sulla tela', () => {
    expect(bar).toMatch(/draggable/);
    expect(bar).toMatch(/ondragstart=/);
  });

  it('dice quale medium sta viaggiando, o la tela non saprebbe cosa creare', () => {
    expect(bar).toMatch(/setData\(/);
  });

  it('ha un nome accessibile: sono icone, e un bottone muto non si legge', () => {
    expect(bar).toMatch(/aria-label|title=/);
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
