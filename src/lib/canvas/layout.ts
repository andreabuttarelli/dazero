/**
 * DOVE NASCE UNA TILE CHE NESSUNO HA ANCORA SPOSTATO.
 *
 * Il difetto da cui nasce questo file: una griglia a passo fisso mette tile di altezze diverse a
 * distanze diverse — un'immagine quadrata accanto a una scheda bassa lascia un buco sotto l'una e
 * fa toccare l'altra alla riga successiva. A colpo d'occhio sembrano un blocco solo.
 *
 * SI IMPILA PER COLONNA PIÙ CORTA, non per righe. Ogni tile scende nella colonna che al momento è
 * arrivata meno in basso: le altezze diverse si compensano da sole, e nessuna colonna resta
 * indietro mentre le altre scendono. È la stessa logica delle `columns` CSS della pagina media —
 * si legge colonna per colonna, che è come si guarda una bacheca.
 *
 * L'ARIA È PARTE DEL LAYOUT, non una decorazione. `GAP` sta fra ogni coppia e un test lo verifica:
 * due tile separate da zero pixel sono indistinguibili da una sola.
 *
 * VALE SOLO ALLA PRIMA APERTURA. Appena qualcuno sposta qualcosa, la posizione la decide lui e
 * questa funzione non la tocca più: chi chiama dispone solo le tile che non hanno ancora una riga
 * in `brand_canvas_items`.
 */

/** Lo spazio fra due tile. Sotto i venti pixel due riquadri leggono come un riquadro solo. */
export const GAP = 28;

/** Quante colonne quando chi chiama non lo dice. */
const DEFAULT_COLUMNS = 5;

export type Sized = { id: string; w: number; h: number };

export type Placed = Sized & { x: number; y: number };

export function packTiles(tiles: Sized[], opts: { columns?: number } = {}): Placed[] {
  const columns = Math.max(1, opts.columns ?? DEFAULT_COLUMNS);
  if (!tiles.length) return [];

  // La colonna è larga quanto la tile più larga: colonne di larghezza diversa farebbero sbandare
  // l'allineamento verticale, che è l'unica cosa che tiene insieme una bacheca a colpo d'occhio.
  const columnWidth = Math.max(...tiles.map((t) => t.w)) + GAP;
  const bottoms = new Array<number>(columns).fill(0);

  return tiles.map((tile) => {
    let column = 0;
    for (let i = 1; i < columns; i++) {
      if (bottoms[i] < bottoms[column]) column = i;
    }
    const placed: Placed = { ...tile, x: column * columnWidth, y: bottoms[column] };
    bottoms[column] = placed.y + tile.h + GAP;
    return placed;
  });
}
