/**
 * L'ICONA DI OGNI TIPO, accanto al suo nome.
 *
 * Sta in un file suo e non in `addable.ts` per una ragione sola: quelle sono icone di Lucide, cioè
 * COMPONENTI. `addable.ts` lo importano anche moduli che girano sul server — la barra, il menù, le
 * validazioni — e tirarsi dentro quattro componenti Svelte per leggere un elenco di stringhe
 * significherebbe pagarli ovunque, anche dove non si disegna niente.
 *
 * Le superfici che li mostrano sono tre: la barra in basso, il menù del doppio clic e la targhetta
 * sul nodo. Finché le icone stavano dentro la barra, le altre due dovevano riscriverle — e due
 * elenchi a mano divergono al primo cambio, in silenzio e solo su una delle superfici: un globo in
 * fondo allo schermo e un quadrato sul nodo, per la stessa cosa.
 */
import Type from '@lucide/svelte/icons/type';
import Image from '@lucide/svelte/icons/image';
import Video from '@lucide/svelte/icons/video';
import Globe from '@lucide/svelte/icons/globe';
import FileText from '@lucide/svelte/icons/file-text';
import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
import Rss from '@lucide/svelte/icons/rss';
import List from '@lucide/svelte/icons/list';
import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
import Orbit from '@lucide/svelte/icons/orbit';
import type { Component } from 'svelte';
import type { Addable } from './addable';

export const ADDABLE_ICON: Record<Addable, Component> = {
  text: Type,
  image: Image,
  video: Video,
  iframe: Globe,
  doc: FileText,
  products: ShoppingBag,
  social_account_feed: Rss,
  list: List,
  select: MousePointerClick,
  effects: WandSparkles,
  composition: Orbit
};
