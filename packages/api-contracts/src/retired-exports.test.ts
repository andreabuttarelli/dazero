import { describe, it, expect } from 'vitest';
import * as contracts from './index';

/**
 * QUELLI CHE NON CI SONO PIÙ, DEL TUTTO.
 *
 * `studio`, il piano editoriale, il piano settimanale, `memory`, blog/autoblog e `captions/generate`
 * sono cancellati insieme al resto del prodotto vecchio: nessuna rotta REST li usa più, quindi
 * nessuno di questi contratti resta esportato.
 */
const GONE = [
  'ADD_COMPETITOR',
  'DELETE_COMPETITOR',
  'DELETE_PRODUCT',
  'DISCARD_PLAN',
  'RECORD_MEMORY_USED',
  'REMOVE_BLOG_TERM',
  'GENERATE_ARTICLE',
  'OPTIMIZE_ARTICLE',
  'GENERATE_CAPTIONS',
  'PROPOSE_PLAN',
  'REVISE_PLAN',
  'PLAN_WEEK',
  'REPLAN_WEEK'
] as const;

/**
 * `GET_ADS` invece resta: `/ads` è vivo (`cli/commands/ads.ts` lo chiama), il contratto continua a
 * descrivere la sua forma anche se non è più un tool MCP a sé.
 */
describe('i contratti delle rotte cancellate', () => {
  it.each(GONE)('%s non è più esportato: nessuna rotta lo usa', (name) => {
    expect(contracts).not.toHaveProperty(name);
  });
});

describe('il contratto ancora esportato per la rotta che resta', () => {
  it('GET_ADS resta esportato: la rotta REST lo usa', () => {
    expect(contracts).toHaveProperty('GET_ADS');
  });

  it('ma non è più un tool', () => {
    const tools = new Set(contracts.BRAND_ENDPOINTS.map((e) => e.tool));
    expect(tools.has(contracts.GET_ADS.tool)).toBe(false);
  });
});
