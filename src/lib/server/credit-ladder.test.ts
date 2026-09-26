import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_MARKUP,
  billedCreditsFor,
  CREDIT_LADDER,
  MARGIN_FLOOR,
  marginForRung
} from './credit-ladder';
import { estimateLoopCredits } from './canvas/loop-cost';
import { IMAGE_CREDITS, videoCredits } from './content-cost';

describe('credit ladder never falls below the margin floor', () => {
  for (const rung of CREDIT_LADDER) {
    it(`$${rung.price} subscription clears the floor in the worst case`, () => {
      // Worst case: the customer spends every credit they bought. No breakage assumption.
      expect(marginForRung(rung.price, rung.creditsSubscription)).toBeGreaterThanOrEqual(
        MARGIN_FLOOR
      );
    });

    it(`$${rung.price} one-time clears the floor in the worst case`, () => {
      expect(marginForRung(rung.price, rung.creditsOneTime)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    });

    it(`$${rung.price} one-time margin is never below its subscription margin`, () => {
      // One-time sells fewer credits per dollar (70:1 vs 100:1), so it must always cost less to
      // honour at the same price — never the other way round.
      expect(marginForRung(rung.price, rung.creditsOneTime)).toBeGreaterThanOrEqual(
        marginForRung(rung.price, rung.creditsSubscription)
      );
    });
  }

  it('the top rung sits exactly on the floor, not below it', () => {
    const top = CREDIT_LADDER[CREDIT_LADDER.length - 1];
    expect(marginForRung(top.price, top.creditsSubscription)).toBeCloseTo(MARGIN_FLOOR, 5);
  });

  it('the first four rungs are a flat 50% margin (no partial discount)', () => {
    for (const rung of CREDIT_LADDER.slice(0, 4)) {
      expect(marginForRung(rung.price, rung.creditsSubscription)).toBeCloseTo(0.5, 5);
    }
  });
});

describe('billedCreditsFor', () => {
  it('matches the anchor: $1 of provider cost bills 200 credits at 100% markup', () => {
    expect(AI_MARKUP).toBe(1.0);
    expect(billedCreditsFor(1)).toBe(200);
  });

  it('$5 of credits cost us $2.50 of provider spend — the user-given anchor', () => {
    const fiveDollarRung = CREDIT_LADDER.find((r) => r.price === 5)!;
    const costUsd = fiveDollarRung.creditsSubscription / 200;
    expect(costUsd).toBeCloseTo(2.5, 5);
  });
});

// Il loop preventiva PRIMA di girare (CLAUDE.md, il nodo mostra il costo prima del clic) e il
// numero mostrato deve essere quello che ai-log.ts addebita davvero — mai un secondo cambio.
describe('il preventivo del loop usa lo stesso cambio della fattura reale', () => {
  it('image: perRun = billedCreditsFor del costo provider misurato', () => {
    const out = estimateLoopCredits({ medium: 'image', model: null, count: 1 });
    expect(out.perRun).toBe(IMAGE_CREDITS);
    expect(out.perRun).toBe(billedCreditsFor(0.069));
  });

  it('video: perRun = billedCreditsFor del costo provider del modello scelto', () => {
    const model = 'bytedance/seedance-2-5';
    const out = estimateLoopCredits({ medium: 'video', model, count: 1 });
    expect(out.perRun).toBe(videoCredits(model));
    expect(out.perRun).toBe(billedCreditsFor(2.1));
  });
});

// Un secondo cambio credito↔dollaro fuori da credit-ladder.ts è esattamente il difetto che ha
// fatto stimare 7 crediti/run un run che ne costava davvero ~14: un file che riscrive
// `CREDITS_PER_USD` diverge dal listino reale al primo prezzo cambiato, in silenzio.
describe('nessun secondo cambio credito/dollaro fuori da credit-ladder.ts', () => {
  const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url));
  const FORBIDDEN = /\bCREDITS_PER_USD\b\s*=/;
  const ALLOWED_FILES = new Set([
    'server/credit-ladder.ts',
    'server/credit-ladder.test.ts',
    // Tasso di ACQUISTO (100 crediti = $1 di listino, PLANS[].credits) — un concetto diverso
    // dal cambio di FATTURAZIONE (billedCreditsFor, 200 crediti = $1 di costo provider). Le due
    // costanti coesistono per costruzione (vedi il commento in testa a credit-ladder.ts); qui
    // ereditano il nome canonico invece di un numero riscritto.
    'server/plan-budget.ts',
    'server/plans.test.ts'
  ]);

  function listTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (statSync(full).isDirectory()) {
        out.push(...listTsFiles(full));
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  const files = listTsFiles(SRC_DIR).filter((f) => /\.tsx?$/.test(f));

  it('ha trovato file .ts da controllare', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((f) => [f.slice(SRC_DIR.length), f] as const))('%s', (label, file) => {
    if (ALLOWED_FILES.has(label)) return;
    const content = readFileSync(file, 'utf-8');
    expect(
      FORBIDDEN.test(content),
      `${label} dichiara un CREDITS_PER_USD proprio — deriva da billedCreditsFor o CREDITS_PER_USD_SUBSCRIPTION_LIST in credit-ladder.ts`
    ).toBe(false);
  });
});
