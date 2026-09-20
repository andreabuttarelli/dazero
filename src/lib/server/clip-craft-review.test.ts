import { describe, it, expect, vi } from 'vitest';
import {
  CLIP_CRAFT_CHECKS,
  clipCraftFindings,
  reviewClipAt,
  reviewClipCraft,
  type ClipCraftJudge
} from './clip-craft-review';

const CLIP = 'data:video/mp4;base64,AAAA';
const BRIEF = 'a barista pulling a shot of espresso, one hand on the portafilter';

const judgeReturning = (findings: Record<string, boolean>): ClipCraftJudge =>
  vi.fn(async () => ({
    checks: CLIP_CRAFT_CHECKS.map((c) => ({ id: c.id, ok: findings[c.id] ?? true, detail: '' }))
  }));

describe('i controlli di una clip sono fatti, non gusti', () => {
  it('ogni controllo nomina il difetto che cerca e come si vede', () => {
    for (const check of CLIP_CRAFT_CHECKS) {
      expect(check.id).toMatch(/^[a-z-]+$/);
      expect(check.looksFor.length).toBeGreaterThan(20);
    }
  });

  // I difetti che il craft UGC promette di evitare: se una regola non ha il suo controllo, è una
  // riga che paghiamo a ogni render senza sapere se viene applicata.
  it('i difetti di resa che il craft UGC previene hanno un controllo', () => {
    const ids = CLIP_CRAFT_CHECKS.map((c) => c.id);

    expect(ids).toContain('hand-count');
    expect(ids).toContain('no-teleport');
    expect(ids).toContain('lip-sync');
    expect(ids).toContain('no-burned-text');
  });
});

describe('reviewClipCraft', () => {
  it('una clip pulita non riporta niente', async () => {
    const verdict = await reviewClipCraft({ clip: CLIP, brief: BRIEF }, { judge: judgeReturning({}) });

    expect(verdict.failed).toEqual([]);
    expect(verdict.checked).toBe(CLIP_CRAFT_CHECKS.length);
  });

  it('riporta il controllo caduto per id, non una frase libera', async () => {
    const verdict = await reviewClipCraft(
      { clip: CLIP, brief: BRIEF },
      { judge: judgeReturning({ 'hand-count': false }) }
    );

    expect(verdict.failed).toEqual(['hand-count']);
  });

  it('NON blocca il render: non esiste un `pass` da cui dipenda un rifiuto', async () => {
    const verdict = await reviewClipCraft(
      { clip: CLIP, brief: BRIEF },
      { judge: judgeReturning({ 'lip-sync': false, 'no-teleport': false }) }
    );

    expect(verdict).not.toHaveProperty('pass');
    expect(verdict.failed).toHaveLength(2);
  });

  it('un giudice che esplode non rompe il giro e lo DICHIARA', async () => {
    const verdict = await reviewClipCraft({ clip: CLIP, brief: BRIEF }, {
      judge: vi.fn(async () => { throw new Error('gateway giù'); })
    });

    expect(verdict.checked).toBe(0);
    expect(verdict.unrun).toBe('gateway giù');
  });

  it('un id inventato dal modello viene scartato invece di inquinare il conto', async () => {
    const verdict = await reviewClipCraft({ clip: CLIP, brief: BRIEF }, {
      judge: vi.fn(async () => ({ checks: [{ id: 'inventato', ok: false, detail: '' }] }))
    });

    expect(verdict.failed).toEqual([]);
  });

  it('un dato che non è un video non arriva al modello', async () => {
    const judge = vi.fn();

    const verdict = await reviewClipCraft({ clip: 'data:image/png;base64,AAAA', brief: BRIEF }, { judge });

    expect(judge).not.toHaveBeenCalled();
    expect(verdict.checked).toBe(0);
    expect(verdict.unrun).toBeTruthy();
  });
});

// Un render restituisce una URL, non un data-URL: senza questa porta il giudice sarebbe
// inutilizzabile da chi rende davvero.
describe('reviewClipAt — la clip si giudica da dove è stata salvata', () => {
  const okFetch = (bytes = 64) =>
    vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'video/mp4' }),
      arrayBuffer: async () => new ArrayBuffer(bytes)
    })) as unknown as typeof fetch;

  it('scarica la clip e la passa al giudice', async () => {
    const judge = judgeReturning({ 'lip-sync': false });

    const verdict = await reviewClipAt('https://cdn.example/clip.mp4', BRIEF, {
      judge,
      fetchImpl: okFetch()
    });

    expect(verdict.failed).toEqual(['lip-sync']);
  });

  it('una clip troppo grande non viene caricata in memoria: lo dichiara e basta', async () => {
    const judge = vi.fn();

    const verdict = await reviewClipAt('https://cdn.example/huge.mp4', BRIEF, {
      judge,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'video/mp4', 'content-length': String(999_000_000) }),
        arrayBuffer: async () => new ArrayBuffer(8)
      })) as unknown as typeof fetch
    });

    expect(judge).not.toHaveBeenCalled();
    expect(verdict.unrun).toMatch(/grande|large/i);
  });

  it('una risposta che non è un video non arriva al modello', async () => {
    const judge = vi.fn();

    const verdict = await reviewClipAt('https://cdn.example/oops.html', BRIEF, {
      judge,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        arrayBuffer: async () => new ArrayBuffer(8)
      })) as unknown as typeof fetch
    });

    expect(judge).not.toHaveBeenCalled();
    expect(verdict.checked).toBe(0);
  });

  it('una rete che cade lo DICHIARA invece di sembrare verde', async () => {
    const verdict = await reviewClipAt('https://cdn.example/clip.mp4', BRIEF, {
      judge: judgeReturning({}),
      fetchImpl: vi.fn(async () => { throw new Error('rete giù'); }) as unknown as typeof fetch
    });

    expect(verdict.checked).toBe(0);
    expect(verdict.unrun).toContain('rete giù');
  });
});

describe('clipCraftFindings', () => {
  it('dice quanti ne ha guardati e quali sono caduti', () => {
    const line = clipCraftFindings({ checked: 5, failed: ['lip-sync'], unrun: null });

    expect(line).toContain('lip-sync');
    expect(line).toContain('5');
  });

  it('un giro non eseguito lo DICHIARA invece di sembrare verde', () => {
    const line = clipCraftFindings({ checked: 0, failed: [], unrun: 'gateway giù' });

    expect(line).toMatch(/non eseguit/i);
    expect(line).toContain('gateway giù');
  });
});
