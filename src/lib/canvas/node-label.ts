/**
 * L'ICONA E IL NOME DI OGNI `nodes.type`, IN UN POSTO SOLO — la targhetta fuori dal corpo del
 * nodo (`CanvasTile.svelte`) legge da qui, e da nessun'altra parte.
 *
 * `ADDABLE_ICON`/`ADDABLE_LABEL` (`addable-icons.ts`, `addable.ts`) rispondono a «cosa si può
 * METTERE sulla tela» — sette tipi, quelli che la barra in basso e il menù del doppio clic
 * offrono. Questa tabella risponde a una domanda più larga: «cosa MOSTRARE sopra un nodo che
 * esiste già», e un nodo esistente può essere uno dei dodici di `nodes_type_check`
 * (`node-data.ts::NODE_TYPES`) — anche i cinque che non si aggiungono da un click:
 * `social_post_mockup` e `ads` nascono da un'azione, `influencer` dal pannello degli influencer,
 * `list`/`select` da un'iterazione. La targhetta deve dire cosa sono anche loro.
 *
 * Riusa i sette che già esistono invece di riscriverli — due tabelle sulla stessa domanda
 * divergono al primo nome cambiato, in silenzio e solo su una delle due superfici.
 */
import Megaphone from '@lucide/svelte/icons/megaphone';
import UserRound from '@lucide/svelte/icons/user-round';
import List from '@lucide/svelte/icons/list';
import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
import LayoutTemplate from '@lucide/svelte/icons/layout-template';
import type { Component } from 'svelte';
import { ADDABLE_ICON } from './addable-icons';
import { ADDABLE_LABEL } from './addable';
import type { NodeType } from './node-data';

export const NODE_KIND_ICON: Record<NodeType, Component> = {
  ...ADDABLE_ICON,
  social_post_mockup: LayoutTemplate,
  ads: Megaphone,
  influencer: UserRound,
  list: List,
  select: MousePointerClick
};

export const NODE_KIND_LABEL: Record<NodeType, string> = {
  ...ADDABLE_LABEL,
  social_post_mockup: 'Anteprima post',
  ads: 'Ads',
  influencer: 'Influencer',
  list: 'Lista',
  select: 'Selezione'
};
