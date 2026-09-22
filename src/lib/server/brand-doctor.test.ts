import { describe, expect, it } from 'vitest';
import { assessLoops, doctorHeadline, type DoctorFacts } from './brand-doctor';

const NOW = Date.parse('2026-08-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

/** Un brand che sta funzionando: tutto collegato, coda vuota, dati propri. */
function healthy(over: Partial<DoctorFacts> = {}): DoctorFacts {
  return {
    now: NOW,
    plan: 'pro',
    hasActiveEditorialPlan: true,
    connectedAccounts: 2,
    exportOnly: false,
    ownHistoryAt: daysAgo(3),
    pendingPosts: 0,
    pendingStalePosts: 0,
    publishedLast30: 9,
    lastTicks: {},
    ...over
  };
}

const loop = (facts: DoctorFacts, name: string) => assessLoops(facts).find((l) => l.loop === name)!;

describe('assessLoops — publishing', () => {
  it('clears every gate for a brand that publishes', () => {
    expect(loop(healthy(), 'publishing').status).toBe('ok');
  });

  it('names the missing accounts first — it is the gate that makes all the others pointless', () => {
    const l = loop(healthy({ connectedAccounts: 0, publishedLast30: 0, pendingPosts: 12 }), 'publishing');
    expect(l.status).toBe('blocked');
    expect(l.blockedBy).toBe('social_accounts');
    expect(l.gates.find((g) => g.id === 'social_accounts')?.fix).toMatch(/Piattaforme/);
  });

  it('does not call zero accounts a failure on an export-only plan', () => {
    // Go vende socialsIncluded: 0. Segnalarlo come guasto vorrebbe dire dire a un cliente pagante
    // che il suo piano è rotto perché funziona come è stato venduto.
    const l = loop(healthy({ connectedAccounts: 0, exportOnly: true }), 'publishing');
    expect(l.gates.find((g) => g.id === 'social_accounts')?.status).toBe('pass');
    expect(l.blockedBy).not.toBe('social_accounts');
  });

  it('reports the backlog on the STALE count and the real threshold, not on the queue size', () => {
    // Lo scheduler frena su >15 pending più vecchi di 7 giorni. Un doctor che frenasse "appena
    // c'è un pending" direbbe all'utente una cosa che il codice non fa.
    const l = loop(healthy({ pendingPosts: 41, pendingStalePosts: 40, publishedLast30: 0 }), 'publishing');
    expect(l.blockedBy).toBe('approval_backlog');
    expect(l.gates.find((g) => g.id === 'approval_backlog')?.detail).toContain('40');
  });

  it('leaves a fresh queue alone: 20 pending posted this week are not a stall', () => {
    const l = loop(healthy({ pendingPosts: 20, pendingStalePosts: 0 }), 'publishing');
    expect(l.gates.find((g) => g.id === 'approval_backlog')?.status).toBe('pass');
    expect(l.status).toBe('ok');
  });

  it('flags a silent stall: accounts connected, queue clear, nothing published', () => {
    const l = loop(healthy({ publishedLast30: 0 }), 'publishing');
    expect(l.blockedBy).toBe('recent_publish');
  });

  it('does not call "nothing published" a failure on an export-only plan', () => {
    const l = loop(healthy({ publishedLast30: 0, exportOnly: true, connectedAccounts: 0 }), 'publishing');
    expect(l.gates.find((g) => g.id === 'recent_publish')?.status).toBe('unknown');
    expect(l.status).toBe('unknown');
    expect(l.blockedBy).toBeNull();
  });
});

describe('doctorHeadline', () => {
  it('leads with the first blocked loop and its fix', () => {
    const head = doctorHeadline(assessLoops(healthy({ connectedAccounts: 0, publishedLast30: 0 })));
    expect(head).toContain('publishing');
    expect(head).toContain('→');
  });

  it('does not claim health it cannot see', () => {
    // "Nessun blocco" deve restare circoscritto ai cicli coperti: il doctor ne vede uno solo.
    expect(doctorHeadline(assessLoops(healthy()))).toContain('cicli coperti');
  });
});
