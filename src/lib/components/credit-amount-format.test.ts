import { describe, expect, it } from 'vitest';

/**
 * `CreditAmount.svelte` fa questi due calcoli nel markup, non in una funzione esportata: il test
 * li isola qui perché il componente non ha un pattern di render in questo repo (nessun test usa
 * @testing-library/svelte). Se la formattazione cambia nel componente, questo test va aggiornato
 * insieme — è la stessa cifra, non due listini che divergono.
 */
function formatCreditText(amount: number, approx: boolean): string {
  return `${approx ? '~' : ''}${amount.toLocaleString()}`;
}

function creditAriaLabel(amount: number): string {
  return `${amount.toLocaleString()} crediti`;
}

describe('formattazione dei crediti', () => {
  it('mostra la tilde solo quando il costo è approssimato', () => {
    expect(formatCreditText(12, true)).toBe('~12');
    expect(formatCreditText(12, false)).toBe('12');
  });

  it('separa le migliaia', () => {
    expect(formatCreditText(52000, false)).toBe('52,000');
  });

  it("l'etichetta per lo screen reader porta la parola intera", () => {
    expect(creditAriaLabel(12)).toBe('12 crediti');
  });
});
