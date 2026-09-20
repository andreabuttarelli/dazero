import { describe, it, expect, vi } from 'vitest';
import {
  PHOTO_CRAFT_CHECKS,
  photoCraftFindings,
  reviewPhotoCraft,
  type PhotoCraftJudge
} from './photo-craft-review';

const IMAGE = 'data:image/png;base64,AAAA';
const BRIEF = 'A jar of honey on a linen cloth, morning light from the left';

/** Il giudice non viene mai chiamato: i test fissano il contratto, non il modello. */
const judgeReturning = (findings: Record<string, boolean>): PhotoCraftJudge =>
  vi.fn(async () => ({
    checks: PHOTO_CRAFT_CHECKS.map((c) => ({ id: c.id, ok: findings[c.id] ?? true, detail: '' }))
  }));

describe('i controlli del mestiere sono fatti, non gusti', () => {
  it('ogni controllo nomina il difetto che cerca e come si vede', () => {
    for (const check of PHOTO_CRAFT_CHECKS) {
      expect(check.id).toMatch(/^[a-z-]+$/);
      expect(check.looksFor.length).toBeGreaterThan(20);
    }
  });

  it('i quattro difetti che il craft promette di evitare hanno un controllo', () => {
    const ids = PHOTO_CRAFT_CHECKS.map((c) => c.id);

    expect(ids).toContain('contact-shadow');
    expect(ids).toContain('no-lighting-gear');
    expect(ids).toContain('product-state');
    expect(ids).toContain('no-unasked-text');
  });
});

describe('reviewPhotoCraft', () => {
  it('un render pulito non riporta niente', async () => {
    const verdict = await reviewPhotoCraft(
      { image: IMAGE, brief: BRIEF },
      { judge: judgeReturning({}) }
    );

    expect(verdict.failed).toEqual([]);
    expect(verdict.checked).toBe(PHOTO_CRAFT_CHECKS.length);
  });

  it('riporta il controllo fallito per id, non una frase libera', async () => {
    const verdict = await reviewPhotoCraft(
      { image: IMAGE, brief: BRIEF },
      { judge: judgeReturning({ 'contact-shadow': false }) }
    );

    expect(verdict.failed).toEqual(['contact-shadow']);
  });

  it('NON blocca il render: non esiste un `pass` da cui dipenda un rifiuto', async () => {
    const verdict = await reviewPhotoCraft(
      { image: IMAGE, brief: BRIEF },
      { judge: judgeReturning({ 'contact-shadow': false, 'no-lighting-gear': false }) }
    );

    expect(verdict).not.toHaveProperty('pass');
    expect(verdict.failed).toHaveLength(2);
  });

  it('un giudice che esplode non rompe il giro: zero controllati, nessun verdetto inventato', async () => {
    const verdict = await reviewPhotoCraft(
      { image: IMAGE, brief: BRIEF },
      { judge: vi.fn(async () => { throw new Error('gateway giù'); }) }
    );

    expect(verdict.checked).toBe(0);
    expect(verdict.failed).toEqual([]);
    expect(verdict.unrun).toBe('gateway giù');
  });

  it('un id che il giudice inventa viene scartato invece di inquinare il conto', async () => {
    const verdict = await reviewPhotoCraft(
      { image: IMAGE, brief: BRIEF },
      { judge: vi.fn(async () => ({ checks: [{ id: 'inventato', ok: false, detail: '' }] })) }
    );

    expect(verdict.failed).toEqual([]);
  });

  it('un dato non-immagine non arriva al modello', async () => {
    const judge = vi.fn();

    const verdict = await reviewPhotoCraft({ image: 'non-una-data-url', brief: BRIEF }, { judge });

    expect(judge).not.toHaveBeenCalled();
    expect(verdict.checked).toBe(0);
    expect(verdict.unrun).toBeTruthy();
  });
});

describe('photoCraftFindings — la riga che un report stampa', () => {
  it('dice quanti ne ha guardati e quali sono caduti', () => {
    const line = photoCraftFindings({ checked: 4, failed: ['contact-shadow'], unrun: null });

    expect(line).toContain('contact-shadow');
    expect(line).toContain('4');
  });

  it('un giro non eseguito lo DICHIARA invece di sembrare verde', () => {
    const line = photoCraftFindings({ checked: 0, failed: [], unrun: 'gateway giù' });

    expect(line).toMatch(/non eseguit|unrun/i);
    expect(line).toContain('gateway giù');
  });
});
