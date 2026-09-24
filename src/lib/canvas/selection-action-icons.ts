/**
 * L'ICONA DI OGNI AZIONE, accanto al suo nome — stessa divisione di `addable-icons.ts`: componenti
 * di Lucide qui, dati puri in `selection-actions.ts`, perché quella tabella la legge anche codice
 * che non disegna niente.
 */
import Copy from '@lucide/svelte/icons/copy';
import Workflow from '@lucide/svelte/icons/workflow';
import Link2 from '@lucide/svelte/icons/link-2';
import Trash2 from '@lucide/svelte/icons/trash-2';
import Hash from '@lucide/svelte/icons/hash';
import type { Component } from 'svelte';
import type { SelectionActionId } from './selection-actions';

export const SELECTION_ACTION_ICON: Record<SelectionActionId, Component> = {
  duplicate: Copy,
  'connect-new': Workflow,
  'connect-existing': Link2,
  'copy-id': Hash,
  delete: Trash2
};
