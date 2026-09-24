export const ERROR_COPY: Record<string, string> = {
  brand_not_found: 'Brand non trovato.',
  no_connected_accounts: 'Nessun account collegato per questo brand.',
  accounts_not_found: 'Uno o più account selezionati non sono validi.',
  delivery_failed: 'Il post è stato creato ma la programmazione è fallita. Riprova dal calendario.',
  node_not_found: 'Uno dei contenuti selezionati non esiste più.',
  brand_and_nodes_required: 'Seleziona un brand e almeno un contenuto.'
};

export function errorCopyFor(code: string): string {
  return ERROR_COPY[code] ?? 'Qualcosa è andato storto. Riprova.';
}
