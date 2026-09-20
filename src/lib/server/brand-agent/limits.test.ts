import { describe, it, expect, vi, afterEach } from 'vitest';
import { AGENT_MAX_STEPS, AGENT_DEADLINE_MS, AGENT_MAX_DURATION_S, agentStopWhen } from './limits';

describe('i limiti di un turno della chat di brand', () => {
  afterEach(() => vi.useRealTimers());

  it('lascia abbastanza passi per disporre una tela intera', () => {
    // Una tile per `insert_row`: dieci post sulla tela sono dieci passi, e prima ci sono
    // l'analisi, le letture e le scritture del brand. A 12 il turno finiva a metà lavoro.
    expect(AGENT_MAX_STEPS).toBeGreaterThanOrEqual(70);
  });

  it('si ferma PRIMA che la piattaforma tagli la funzione', () => {
    // Il taglio di Vercel non è una fine del turno: è una risposta troncata, senza `onFinish`,
    // quindi senza il turno salvato. Il margine è ciò che fa chiudere l'agente da sé.
    expect(AGENT_DEADLINE_MS).toBeLessThan(AGENT_MAX_DURATION_S * 1000);
  });

  it('ferma il turno quando la deadline è passata', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const stop = agentStopWhen(startedAt);

    vi.setSystemTime(startedAt + AGENT_DEADLINE_MS + 1);

    expect(stop({ steps: [] })).toBe(true);
  });

  it('lascia correre un turno giovane che non ha speso i passi', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const stop = agentStopWhen(startedAt);

    vi.setSystemTime(startedAt + 1_000);

    expect(stop({ steps: new Array(3) })).toBe(false);
  });

  it('ferma il turno che ha speso tutti i passi, anche se ha tempo', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const stop = agentStopWhen(startedAt);

    vi.setSystemTime(startedAt + 1_000);

    expect(stop({ steps: new Array(AGENT_MAX_STEPS) })).toBe(true);
  });
});
