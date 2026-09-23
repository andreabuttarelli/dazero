/**
 * QUANTE GENERAZIONI UN LOOP FA, E CON QUALE VALORE OGNUNA — pura logica, nessun database, nessuna
 * chiamata a un modello. `runGenNode` gira UNA generazione; questo file dice, prima di girare
 * niente, quante ce ne sono e cosa entra in ciascuna — la stessa separazione di `upstream-inputs.ts`
 * (cosa un nodo riceve) e `graph.ts` (cosa sarebbe lecito): la validazione sta lontana
 * dall'esecuzione, per poter dire "1000 combinazioni, troppe" mentre il puntatore è ancora in aria.
 *
 * UN `LoopAxis` è un filo `iterate` risolto: il nodo sorgente e i suoi valori, nell'ordine in cui
 * `upstream-inputs.ts` li darebbe a un filo `fixed` — una `list` intera, o (in futuro) qualunque
 * nodo a valore multiplo. Questo file non sa da dove vengono i valori, solo quanti sono.
 *
 * DUE COMBINAZIONI, UNA TABELLA SOLA (CLAUDE.md — un `if` sparso diverge in silenzio):
 *
 *   product (default)  →  cartesiano: ogni valore del primo asse × ogni valore del secondo × …
 *                          Il PRIMO asse varia più lento — la stessa convenzione di un contatore
 *                          a più cifre, dove la cifra più a sinistra cambia per ultima.
 *   zip                →  accoppiato indice per indice: 1° con 1°, 2° con 2°, …
 *                          Lunghezze diverse: vince la più CORTA, e `shortestWins` lo dice — mai
 *                          un buco silenzioso che lascerebbe un'iterazione con un valore assente.
 *
 * NESSUN ASSE, REPEAT N: le varianti semplici di un nodo senza input iterate — CLAUDE.md le chiama
 * esplicitamente ("repeat N" per N varianti dello stesso prompt). Un'iterazione senza assi ha un
 * `values` vuoto: chi esegue ci somma il prompt fisso del nodo, che non cambia fra le N copie.
 */

export type LoopAxis = { nodeId: string; values: string[] };

export type LoopCombine = 'product' | 'zip';

export type PlannedCombination = { label: string; values: Record<string, string> };

export type CombinationPlan = {
  combinations: PlannedCombination[];
  /** Solo per `zip` con lunghezze diverse: quale asse ha deciso quante iterazioni ci sono. */
  shortestWins: { nodeId: string; length: number } | null;
};

function labelFor(axes: LoopAxis[], indices: number[]): string {
  return axes.map((axis, i) => `${axis.nodeId} ${indices[i] + 1}`).join(' × ');
}

function cartesian(axes: LoopAxis[]): PlannedCombination[] {
  const out: PlannedCombination[] = [];
  const indices = axes.map(() => 0);

  const total = axes.reduce((n, a) => n * a.values.length, 1);
  if (total === 0) return out;

  for (let n = 0; n < total; n++) {
    const values: Record<string, string> = {};
    axes.forEach((axis, i) => { values[axis.nodeId] = axis.values[indices[i]]; });
    out.push({ label: labelFor(axes, indices), values });

    for (let i = axes.length - 1; i >= 0; i--) {
      indices[i]++;
      if (indices[i] < axes[i].values.length) break;
      indices[i] = 0;
    }
  }

  return out;
}

function zipped(axes: LoopAxis[]): { combinations: PlannedCombination[]; shortestWins: CombinationPlan['shortestWins'] } {
  if (!axes.length) {
    return { combinations: [], shortestWins: null };
  }

  const shortest = axes.reduce((min, a) => (a.values.length < min.values.length ? a : min));
  const uneven = axes.some((a) => a.values.length !== shortest.values.length);

  const combinations: PlannedCombination[] = [];
  for (let i = 0; i < shortest.values.length; i++) {
    const values: Record<string, string> = {};
    axes.forEach((axis) => { values[axis.nodeId] = axis.values[i]; });
    combinations.push({ label: axes.map((axis) => `${axis.nodeId} ${i + 1}`).join(' × '), values });
  }

  return {
    combinations,
    shortestWins: uneven ? { nodeId: shortest.nodeId, length: shortest.values.length } : null
  };
}

/**
 * IL PIANO INTERO. `repeat` conta solo quando NON ci sono assi — la stessa regola che
 * `CANVAS.md` chiede: un nodo con archi `iterate` calcola le combinazioni, uno senza usa
 * "repeat N" per le varianti semplici. I due non si sommano: un loop con assi ignora `repeat`,
 * perché il numero di iterazioni lo dettano già i valori collegati.
 */
export function planCombinations(axes: LoopAxis[], combine: LoopCombine, repeat: number): CombinationPlan {
  if (!axes.length) {
    const count = Math.max(1, Math.round(repeat));
    const combinations: PlannedCombination[] = count === 1
      ? [{ label: '', values: {} }]
      : Array.from({ length: count }, (_, i) => ({ label: `variante ${i + 1}`, values: {} }));
    return { combinations, shortestWins: null };
  }

  if (combine === 'zip') {
    return zipped(axes);
  }

  return { combinations: cartesian(axes), shortestWins: null };
}

/**
 * LE SOGLIE DI SICUREZZA, in un posto solo — CLAUDE.md le fissa per nome: fino a 50 gira al clic,
 * sopra chiede una conferma esplicita, sopra 1000 si rifiuta e si chiede di dividere il loop.
 */
export const LOOP_CONFIRM_ABOVE = 50;
export const LOOP_MAX = 1000;

export type LoopSafety = { verdict: 'run' | 'confirm' | 'refuse'; count: number };

export function loopSafety(count: number): LoopSafety {
  if (count > LOOP_MAX) return { verdict: 'refuse', count };
  if (count > LOOP_CONFIRM_ABOVE) return { verdict: 'confirm', count };
  return { verdict: 'run', count };
}
