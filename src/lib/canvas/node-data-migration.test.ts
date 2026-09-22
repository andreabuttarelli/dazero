import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NODE_TYPES, looseNodeJsonSchema } from './node-data';

/**
 * IL GUARDIANO CHE `checks.ts` NON HA: quel file dichiara di dover essere aggiornato a mano quando
 * un CHECK cambia sul database vero, e lo fa perché non generarlo costerebbe una connessione a ogni
 * `vitest run`. Qui il rischio è diverso e si chiude gratis: la migrazione
 * `20260922_jsonb_check_constraints.sql` incolla l'output LETTERALE di `looseNodeJsonSchema` per
 * ognuno dei nove tipi — non serve il database per accorgersi che uno dei due è cambiato senza
 * l'altro, basta confrontare le stringhe. Se questo test è rosso, la migrazione è vecchia: la si
 * rigenera con lo stesso comando che il commento in cima al file SQL riporta.
 */
const MIGRATION_PATH = fileURLToPath(
  new URL('../../../supabase/canvas-migrations/20260922_jsonb_check_constraints.sql', import.meta.url)
);

describe('la migrazione dei CHECK jsonb non è divergente dal generatore', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');

  for (const type of NODE_TYPES) {
    it(`${type}: lo schema incollato nel CHECK è l'output di looseNodeJsonSchema('${type}')`, () => {
      const expected = JSON.stringify(looseNodeJsonSchema(type));
      expect(migration).toContain(expected);
    });
  }
});
