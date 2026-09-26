import { describe, expect, it } from 'vitest';
import {
  planCombinations,
  loopSafety,
  LOOP_CONFIRM_ABOVE,
  LOOP_MAX,
  type LoopAxis
} from './loop-plan';

const axis = (id: string, length: number): LoopAxis => ({
  nodeId: id,
  values: Array.from({ length }, (_, i) => `${id}-${i + 1}`)
});

describe('planCombinations — product (default)', () => {
  it('nessun asse, repeat 1: una sola iterazione vuota', () => {
    const out = planCombinations([], 'product', 1);
    expect(out.combinations).toHaveLength(1);
    expect(out.combinations[0]).toEqual({ label: '', values: {} });
  });

  it('nessun asse, repeat N: N iterazioni identiche — le varianti semplici', () => {
    const out = planCombinations([], 'product', 3);
    expect(out.combinations).toHaveLength(3);
    expect(out.combinations.map((c) => c.label)).toEqual(['variante 1', 'variante 2', 'variante 3']);
  });

  it('un asse solo: un elemento per valore', () => {
    const out = planCombinations([axis('models', 3)], 'product', 1);
    expect(out.combinations).toHaveLength(3);
    expect(out.combinations.map((c) => c.values.models)).toEqual(['models-1', 'models-2', 'models-3']);
  });

  it('tre assi 10x10x10: il prodotto cartesiano è 1000, ed etichetta ogni combinazione', () => {
    const out = planCombinations([axis('models', 10), axis('envs', 10), axis('garments', 10)], 'product', 1);
    expect(out.combinations).toHaveLength(1000);
    expect(out.combinations[0].label).toBe('models 1 × envs 1 × garments 1');
    expect(out.combinations[999].label).toBe('models 10 × envs 10 × garments 10');
  });

  it('due assi 2x3: il prodotto è 6, nell ordine deterministico (primo asse varia più lento)', () => {
    const out = planCombinations([axis('a', 2), axis('b', 3)], 'product', 1);
    expect(out.combinations.map((c) => `${c.values.a}|${c.values.b}`)).toEqual([
      'a-1|b-1',
      'a-1|b-2',
      'a-1|b-3',
      'a-2|b-1',
      'a-2|b-2',
      'a-2|b-3'
    ]);
  });
});

describe('planCombinations — zip', () => {
  it('due liste della stessa lunghezza: accoppiate indice per indice', () => {
    const out = planCombinations([axis('a', 3), axis('b', 3)], 'zip', 1);
    expect(out.combinations).toHaveLength(3);
    expect(out.combinations.map((c) => `${c.values.a}|${c.values.b}`)).toEqual([
      'a-1|b-1',
      'a-2|b-2',
      'a-3|b-3'
    ]);
    expect(out.shortestWins).toBeNull();
  });

  it('lunghezze diverse: vince la più corta, e lo dice', () => {
    const out = planCombinations([axis('a', 5), axis('b', 2)], 'zip', 1);
    expect(out.combinations).toHaveLength(2);
    expect(out.shortestWins).toEqual({ nodeId: 'b', length: 2 });
  });

  it('un asse vuoto: zero combinazioni, non un crash', () => {
    const out = planCombinations([axis('a', 0), axis('b', 3)], 'zip', 1);
    expect(out.combinations).toHaveLength(0);
  });
});

describe('loopSafety — le soglie: fino a 50 gira, sopra chiede conferma, oltre 1000 si rifiuta', () => {
  it('costanti: 50 e 1000, non un numero indovinato altrove', () => {
    expect(LOOP_CONFIRM_ABOVE).toBe(50);
    expect(LOOP_MAX).toBe(1000);
  });

  it('sotto la soglia: gira al click, nessuna conferma', () => {
    expect(loopSafety(1)).toEqual({ verdict: 'run', count: 1 });
    expect(loopSafety(50)).toEqual({ verdict: 'run', count: 50 });
  });

  it('sopra 50 e fino a 1000: serve una conferma esplicita', () => {
    expect(loopSafety(51)).toEqual({ verdict: 'confirm', count: 51 });
    expect(loopSafety(1000)).toEqual({ verdict: 'confirm', count: 1000 });
  });

  it('sopra 1000: rifiutato, si divide il loop', () => {
    expect(loopSafety(1001)).toEqual({ verdict: 'refuse', count: 1001 });
  });

  it('zero combinazioni: nulla da girare, non un errore', () => {
    expect(loopSafety(0)).toEqual({ verdict: 'run', count: 0 });
  });
});
