/**
 * QUANTO RIMPICCIOLIRE UNA PAGINA PERCHÉ ENTRI IN UN NODO.
 *
 * Il difetto da cui nasce questo file: l'iframe era largo quanto il nodo (`width: 100%`), quindi
 * un sito scritto per una finestra da desktop riceveva trecento pixel. Si leggeva come «il
 * contenuto è zoomato» ed era il contrario — era una finestra piccola, e il sito rispondeva come
 * risponde a un telefono oppure mostrava il suo angolo in alto a sinistra a grandezza naturale.
 *
 * La cura è quella di ogni anteprima: dare all'iframe la larghezza per cui la pagina è scritta e
 * ridurre il RISULTATO con `transform: scale()`. Il fattore e l'altezza compensata sono
 * aritmetica, e stanno qui invece che dentro il componente perché sono l'unica parte di tutta la
 * faccenda che si può verificare senza un browser.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * E LO ZOOM DELLA TELA? SI MOLTIPLICA, ED È QUEL CHE SERVE.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * SvelteFlow scala l'intero `.svelte-flow__viewport` con una `transform`, e il nostro `scale`
 * vive dentro quel riquadro: le due trasformazioni si compongono, come qualunque coppia di
 * `transform` annidate. È il comportamento giusto e non una coincidenza fortunata — il nodo si
 * rimpicciolisce con la tela e la pagina dentro si rimpicciolisce ESATTAMENTE con lui, restando
 * nella stessa proporzione a ogni tacca di zoom.
 *
 * Il fattore infatti NON guarda lo zoom della tela, di proposito: leggerlo per compensarlo
 * significherebbe ridisegnare ogni pagina incorporata a ogni battito della rotella, e ottenere
 * una pagina che cambia impaginato mentre si zooma — cioè l'unica cosa peggiore di quella di
 * prima. Guarda la misura del nodo in unità di TELA, che lo zoom non tocca.
 */

/**
 * La larghezza per cui una pagina web si aspetta di essere disegnata.
 *
 * 1280 è il desktop tipico ed è la soglia sopra la quale i punti di rottura CSS più diffusi
 * (`lg` di Tailwind è 1024, `xl` è 1280) danno l'impaginato pieno. Sotto i 1024 quasi ogni sito
 * passa al suo impaginato per tablet, e l'anteprima smetterebbe di somigliare a quel che si vede
 * aprendo il link nella scheda accanto — che è l'unica cosa che deve fare.
 *
 * Non è configurabile, e la decisione è esplicita: un secondo numero per nodo vorrebbe dire un
 * campo in più da riempire nel momento in cui si incolla un indirizzo, per una scelta che nove
 * volte su dieci è questa. Il giorno in cui una dashboard incorporata ne pretenderà un'altra, la
 * colonna si aggiunge — ma si aggiunge allora, con il caso vero davanti.
 */
export const EMBED_REFERENCE_WIDTH = 1280;

/**
 * Di quanto va ridotta la pagina perché la sua larghezza di riferimento stia nel nodo.
 *
 * Mai sopra 1: ingrandire stirerebbe il testo invece di mostrarlo meglio, e un nodo più largo del
 * riferimento la pagina la contiene già comoda.
 *
 * Una misura assente o assurda vale «a grandezza naturale» invece di propagarsi: la larghezza
 * arriva da un `ResizeObserver` e sul primo battito è 0, e uno 0 o un NaN dentro una `transform`
 * fa sparire il riquadro senza che nessuno riceva un errore.
 */
export function embedScale(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;

  return Math.min(1, width / EMBED_REFERENCE_WIDTH);
}

export type EmbedBox = { width: number; height: number; scale: number };

/**
 * Quanto grande va fatto l'iframe perché, una volta ridotto, riempia esattamente il nodo.
 *
 * L'altezza si divide per il fattore per la stessa ragione per cui la larghezza è quella di
 * riferimento: `scale` riduce entrambe le dimensioni, quindi quella da dare all'elemento è quella
 * che DOPO la riduzione coincide con lo spazio vero.
 */
export function embedBox(node: { width: number; height: number }): EmbedBox {
  const scale = embedScale(node.width);
  const height = Number.isFinite(node.height) && node.height > 0 ? node.height : 0;

  return {
    width: scale < 1 ? EMBED_REFERENCE_WIDTH : node.width,
    height: height / scale,
    scale
  };
}
