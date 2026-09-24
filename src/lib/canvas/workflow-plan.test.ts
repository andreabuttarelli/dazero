import { describe, expect, it } from 'vitest';
import { planWorkflow, stepReadiness } from './workflow-plan';

const types = (entries: [string, string][]) => new Map(entries);

describe('planWorkflow — quali passi, in quale ordine', () => {
  it('catena A→B→C: tre passi in ordine, ciascuno dipende dal precedente', () => {
    const out = planWorkflow(
      ['A', 'B', 'C'],
      [
        { sourceNodeId: 'A', targetNodeId: 'B' },
        { sourceNodeId: 'B', targetNodeId: 'C' }
      ],
      types([['A', 'text'], ['B', 'image'], ['C', 'video']])
    );

    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(out.steps.map((s) => s.nodeId)).toEqual(['A', 'B', 'C']);
    expect(out.steps.find((s) => s.nodeId === 'C')?.dependsOn).toEqual(['B']);
  });

  it('diamante A→B, A→C, B→D, C→D: D aspetta sia B che C', () => {
    const out = planWorkflow(
      ['A', 'B', 'C', 'D'],
      [
        { sourceNodeId: 'A', targetNodeId: 'B' },
        { sourceNodeId: 'A', targetNodeId: 'C' },
        { sourceNodeId: 'B', targetNodeId: 'D' },
        { sourceNodeId: 'C', targetNodeId: 'D' }
      ],
      types([['A', 'text'], ['B', 'image'], ['C', 'image'], ['D', 'video']])
    );

    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    const d = out.steps.find((s) => s.nodeId === 'D')!;
    expect(new Set(d.dependsOn)).toEqual(new Set(['B', 'C']));
    expect(out.steps.findIndex((s) => s.nodeId === 'D')).toBeGreaterThan(out.steps.findIndex((s) => s.nodeId === 'B'));
    expect(out.steps.findIndex((s) => s.nodeId === 'D')).toBeGreaterThan(out.steps.findIndex((s) => s.nodeId === 'C'));
  });

  it('due nodi selezionati ma non collegati fra loro: rifiuta', () => {
    const out = planWorkflow(['A', 'B'], [], types([['A', 'text'], ['B', 'image']]));

    expect(out.ok).toBe(false);
  });

  it('un ciclo A→B→A: rifiuta', () => {
    const out = planWorkflow(
      ['A', 'B'],
      [
        { sourceNodeId: 'A', targetNodeId: 'B' },
        { sourceNodeId: 'B', targetNodeId: 'A' }
      ],
      types([['A', 'text'], ['B', 'image']])
    );

    expect(out.ok).toBe(false);
  });

  it('un nodo doc nella selezione: rifiuta, non è generativo', () => {
    const out = planWorkflow(
      ['A', 'B'],
      [{ sourceNodeId: 'A', targetNodeId: 'B' }],
      types([['A', 'doc'], ['B', 'image']])
    );

    expect(out.ok).toBe(false);
  });

  it('un solo nodo selezionato: rifiuta, un workflow serve almeno due passi', () => {
    const out = planWorkflow(['A'], [], types([['A', 'image']]));

    expect(out.ok).toBe(false);
  });
});

describe('stepReadiness — pronto, in attesa, o bloccato', () => {
  it('tutte le dipendenze done: ready', () => {
    expect(stepReadiness(['done', 'done'])).toBe('ready');
  });

  it('una dipendenza failed: blocked', () => {
    expect(stepReadiness(['done', 'failed'])).toBe('blocked');
  });

  it('una dipendenza expired: blocked', () => {
    expect(stepReadiness(['expired'])).toBe('blocked');
  });

  it('una dipendenza ancora running: waiting', () => {
    expect(stepReadiness(['done', 'running'])).toBe('waiting');
  });

  it('nessuna dipendenza: ready', () => {
    expect(stepReadiness([])).toBe('ready');
  });
});
