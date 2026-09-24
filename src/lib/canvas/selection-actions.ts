/**
 * COSA SI PUÒ FARE A UNA SELEZIONE — una tabella, non un markup scritto a mano per ogni bottone.
 *
 * La barra che disegna questi bottoni (`SelectionToolbar.svelte`) non decide da sé quali mostrare
 * e in che ordine: legge questo elenco. Un'azione nuova — "Crea post dalla selezione", che arriva
 * dopo — è una riga qui, non un `{#if}` in più nel componente: lo stesso motivo per cui
 * `CANVAS_SHORTCUTS` esiste accanto a `matchCanvasShortcut`.
 *
 * `enabledFor` DICE SE L'AZIONE HA SENSO su QUESTA selezione, non se è "sempre visibile ma
 * spenta": duplicare e cancellare vanno bene su qualunque numero di nodi, ma collegare a un nodo
 * esistente ha bisogno di un bersaglio che non sia già nella selezione — quella domanda la fa
 * chi monta la barra, non questo file, perché richiede di sapere quali id esistono sulla tela.
 * Qui la tabella dice solo cosa un'azione È: un id, un'etichetta, quale scorciatoia la richiama
 * (se ne ha una — non tutte, "Connetti a…" resta senza perché ha bisogno di un secondo clic).
 */

import { postCompositionFor, type PostCompositionNode } from './post-composition';

export type SelectionActionId = 'duplicate' | 'connect-new' | 'connect-existing' | 'create-post' | 'copy-id' | 'delete';

export type SelectionAction = {
  id: SelectionActionId;
  label: string;
  /** Le stesse etichette di `CANVAS_SHORTCUTS`, per chi vuole mostrarle nel `title` del bottone. */
  keys?: string[];
};

export const SELECTION_ACTIONS: readonly SelectionAction[] = [
  { id: 'duplicate', label: 'Duplica', keys: ['mod', 'D'] },
  { id: 'connect-new', label: 'Collega a nuovo…' },
  { id: 'connect-existing', label: 'Collega a…' },
  { id: 'create-post', label: 'Crea post' },
  { id: 'copy-id', label: 'Copia id' },
  { id: 'delete', label: 'Elimina', keys: ['⌫'] }
];

export function enabledFor(
  id: SelectionActionId,
  nodeSummaries: PostCompositionNode[]
): { enabled: boolean; reason?: string } {
  if (id === 'create-post') {
    const composition = postCompositionFor(nodeSummaries);
    return {
      enabled: composition.enabled,
      reason: composition.enabled ? undefined : 'Serve almeno un media o un testo nella selezione'
    };
  }

  return { enabled: true };
}
