import { describe, expect, it } from 'vitest';
import {
  AGENT_META,
  DEFAULT_AGENT_ID,
  NEW_CHAT_AGENT_ID,
  agentMetaForBrand,
  normalizeAgentId
} from './agent-icons';

const ids = (list: Array<{ id: string }>) => list.map((a) => a.id);

describe('agentMetaForBrand — dazero non e’ piu’ una scelta', () => {
  it('il picker offre solo i cinque mestieri', () => {
    expect(ids(agentMetaForBrand(true))).toEqual(['content', 'ugc', 'motion', 'web', 'analyst']);
    expect(ids(agentMetaForBrand(true))).not.toContain(DEFAULT_AGENT_ID);
  });

  it('rientra in lista SOLO quando e’ gia’ lei l’agente aperto (thread vecchi)', () => {
    expect(ids(agentMetaForBrand(true, DEFAULT_AGENT_ID))).toContain(DEFAULT_AGENT_ID);
    // Uno specialista selezionato non la fa riapparire.
    expect(ids(agentMetaForBrand(true, 'content'))).not.toContain(DEFAULT_AGENT_ID);
  });

  it('il lock del Web hub resta indipendente', () => {
    expect(ids(agentMetaForBrand(false))).not.toContain('web');
    expect(ids(agentMetaForBrand(false, DEFAULT_AGENT_ID))).toEqual([
      'auto',
      'content',
      'ugc',
      'motion',
      'analyst'
    ]);
  });
});

describe('i due default', () => {
  it('un thread senza agente resta dazero — normalizzarlo su uno specialista lo dirotterebbe', () => {
    expect(normalizeAgentId(null)).toBe(DEFAULT_AGENT_ID);
    expect(normalizeAgentId('')).toBe(DEFAULT_AGENT_ID);
    // Legacy: gli id vecchi continuano a mappare sul mestiere giusto.
    expect(normalizeAgentId('publish')).toBe('content');
  });

  it('una chat NUOVA parte da un mestiere vero, presente nel picker', () => {
    expect(NEW_CHAT_AGENT_ID).not.toBe(DEFAULT_AGENT_ID);
    expect(ids(agentMetaForBrand(true))).toContain(NEW_CHAT_AGENT_ID);
    expect(AGENT_META.some((a) => a.id === NEW_CHAT_AGENT_ID)).toBe(true);
  });
});
