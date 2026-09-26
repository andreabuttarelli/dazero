// Il database, la scala prezzi e il gate crediti restano in unità intere (14 crediti addebitati,
// 997951 di saldo): questo formatter è l'unico punto che li divide per mostrarli come dollari
// approssimati — 1 credito visualizzato = $1. Nessun'altra parte dell'app fa questa divisione.
export const DISPLAY_UNITS_PER_CREDIT = 100;

const MIN_DISPLAYED_VALUE = 0.01;

export function formatCredits(units: number, { approx = false }: { approx?: boolean } = {}): string {
  const value = units / DISPLAY_UNITS_PER_CREDIT;
  const prefix = approx ? '~' : '';

  if (value > 0 && value < MIN_DISPLAYED_VALUE) {
    return `${prefix}<${MIN_DISPLAYED_VALUE.toFixed(2)}`;
  }

  return `${prefix}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
