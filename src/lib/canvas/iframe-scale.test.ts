import { describe, expect, it } from 'vitest';
import { EMBED_REFERENCE_WIDTH, embedScale, embedBox } from './iframe-scale';

/**
 * IL DIFETTO: la pagina dentro il nodo si vedeva ZOOMATA.
 *
 * L'iframe era largo quanto il nodo — `width: 100%` — quindi un sito scritto per una finestra da
 * desktop riceveva 340 pixel e rispondeva come risponde a un telefono, oppure mostrava l'angolo in
 * alto a sinistra a grandezza naturale. Si leggeva come «è zoomato»: non lo era, era una finestra
 * piccola.
 *
 * La cura è quella di sempre per le anteprime: dare all'iframe la larghezza per cui la pagina è
 * scritta e RIMPICCIOLIRE il risultato. Il fattore e la misura compensata sono aritmetica, quindi
 * vivono qui e non dentro un componente: sono la sola parte di tutta la faccenda che si può
 * verificare senza un browser.
 */
describe('la misura di riferimento di una pagina incorporata', () => {
  it('è quella di un desktop, non quella del nodo', () => {
    // Il numero conta: sotto i 1024 quasi ogni sito passa al suo impaginato per tablet, e
    // l'anteprima smetterebbe di somigliare a quel che si vede aprendo il link.
    expect(EMBED_REFERENCE_WIDTH).toBe(1280);
  });
});

describe('il fattore con cui la pagina rientra nel nodo', () => {
  it('rimpicciolisce quando il nodo è più stretto del riferimento', () => {
    expect(embedScale(640)).toBeCloseTo(0.5);
    expect(embedScale(320)).toBeCloseTo(0.25);
  });

  it('non INGRANDISCE un nodo più largo del riferimento', () => {
    // Oltre 1 la pagina verrebbe stirata e il testo sgranato: a quel punto sta già comoda, e
    // l'anteprima giusta è quella a grandezza naturale.
    expect(embedScale(1920)).toBe(1);
    expect(embedScale(EMBED_REFERENCE_WIDTH)).toBe(1);
  });

  it('regge una misura assente o assurda invece di restituire NaN o zero', () => {
    // La larghezza arriva da un `ResizeObserver`, che sul primo battito può dare 0 — e un
    // fattore 0 o NaN finisce in una `transform` che fa sparire il riquadro senza un errore.
    expect(embedScale(0)).toBe(1);
    expect(embedScale(-10)).toBe(1);
    expect(embedScale(Number.NaN)).toBe(1);
  });
});

describe('quanto grande va fatto l iframe perché, rimpicciolito, riempia il nodo', () => {
  it('largo il riferimento e alto quanto basta a compensare la riduzione', () => {
    // 640 di nodo, fattore 0.5: l'iframe va 1280 × 800 perché 800 × 0.5 = 400, l'altezza vera.
    expect(embedBox({ width: 640, height: 400 })).toEqual({
      width: 1280,
      height: 800,
      scale: 0.5
    });
  });

  it('a grandezza naturale prende esattamente la misura del nodo', () => {
    expect(embedBox({ width: 1280, height: 720 })).toEqual({
      width: 1280,
      height: 720,
      scale: 1
    });
  });

  it('su una misura non ancora nota dà un riquadro disegnabile, non uno alto infinito', () => {
    // `height / 0` è `Infinity`, e un iframe alto Infinity non si disegna: il primo battito
    // dell'observer arriva prima che il nodo abbia una misura, ed è il caso normale.
    const box = embedBox({ width: 0, height: 0 });

    expect(Number.isFinite(box.width)).toBe(true);
    expect(Number.isFinite(box.height)).toBe(true);
  });
});
