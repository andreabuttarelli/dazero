import { describe, it, expect } from 'vitest';
import * as contracts from './index';

/**
 * RITIRARE UN TOOL NON È CANCELLARE UN CONTRATTO.
 *
 * Togliere un endpoint da `BRAND_ENDPOINTS` smette di esporlo come tool MCP, e basta: la rotta
 * REST resta, il CLI la chiama, e il contratto è la forma con cui la chiama. Il mio primo giro di
 * ritiri ha tolto anche gli export dal barrel, e tre rotte hanno smesso di compilare —
 * `ADD_RADAR_SOURCE`, `REMOVE_RADAR_SOURCE`, `REMOVE_BLOG_TERM` importati da moduli che non li
 * esportavano più.
 *
 * Erano errori di TIPO, non di esecuzione: il codice girava e `svelte-check` li mostrava in mezzo
 * a trecento preesistenti. È il modo in cui un difetto introdotto passa per difetto di sempre.
 */
const RETIRED_BUT_EXPORTED = [
  'ADD_COMPETITOR',
  'ADD_RADAR_SOURCE',
  'DELETE_COMPETITOR',
  'DELETE_PRODUCT',
  'DISCARD_PLAN',
  'GET_ADS',
  'RECORD_MEMORY_USED',
  'REMOVE_BLOG_TERM',
  'REMOVE_RADAR_SOURCE',
  // I sette che scrivevano testo con un modello loro. L'autopilot gira sulle stesse funzioni che
  // le loro rotte chiamano, su ogni brand con un piano attivo: la rotta deve continuare a
  // compilare e a validare, ed è questo export a tenerla in piedi.
  'GENERATE_ARTICLE',
  'OPTIMIZE_ARTICLE',
  'GENERATE_CAPTIONS',
  'PROPOSE_PLAN',
  'REVISE_PLAN',
  'PLAN_WEEK',
  'REPLAN_WEEK'
] as const;

describe('i contratti dei tool ritirati', () => {
  it.each(RETIRED_BUT_EXPORTED)('%s resta esportato: la rotta REST lo usa', (name) => {
    expect(contracts).toHaveProperty(name);
  });

  it('ma nessuno di loro è più un tool', () => {
    const tools = new Set(contracts.BRAND_ENDPOINTS.map((e) => e.tool));

    for (const name of RETIRED_BUT_EXPORTED) {
      const contract = (contracts as Record<string, unknown>)[name] as { tool: string };
      expect(tools.has(contract.tool), contract.tool).toBe(false);
    }
  });
});
