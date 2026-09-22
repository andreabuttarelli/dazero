import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * LA REGOLA C'ERA E NON MORDEVA.
 *
 * `canConnect` e `verdictBetween` sono scritti e coperti da test, ma rispondono su un `CanvasNode`
 * — e le tile del workbench non ne portavano nessuno. La regola, giustamente, non rifiuta quel che
 * non conosce: il risultato era una verifica verde in un file e nessun arco rifiutato nel
 * prodotto. Lo stesso per il verso, salvato sempre `derives_from`, e per il pannello dell'arco,
 * che senza i due callback non si apriva.
 *
 * Difetti di CABLAGGIO, non di logica: nessun test sul modello poteva vederli, e infatti nessuno
 * li ha visti.
 */
const page = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'routes', 'p', '[projectId]', 'workbench', '+page.svelte'),
  'utf8'
);

describe('il workbench accende quel che la tela sa già fare', () => {
  it('dice che tipo è OGNI tile, o la verifica tace su quelle che non lo dicono', () => {
    // Una sola occorrenza non basta: i nodi che producono e le pagine incorporate sono due liste
    // diverse, e coprirne una sola darebbe una verifica che morde a metà — il caso peggiore,
    // perché sembra funzionare finché non si collega proprio quell'altra.
    const uses = page.match(/node:\s*tileNode\(/g) ?? [];

    expect(uses.length).toBeGreaterThanOrEqual(2);
  });

  it('salva il verso che la tela ha scelto, non uno fisso', () => {
    const connect = /function connect\([\s\S]*?\n  \}/.exec(page)?.[0] ?? '';

    expect(connect).toMatch(/kind/);
    expect(connect).not.toMatch(/'derives_from'/);
  });

  it('permette di togliere una linea e di cambiarle verso', () => {
    expect(page).toMatch(/onEdgeDelete=/);
    expect(page).toMatch(/onEdgeRetype=/);
  });
});
