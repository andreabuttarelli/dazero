/**
 * IL NODO `products`: una query su uno store pubblico, non una copia del suo catalogo.
 *
 * Indipendente da qualsiasi brand — prende un URL di store e un tipo (`shopify`/`woocommerce`) e
 * scarica da lì, punto. Il nodo porta SOLO la query (`type`, `url`, `limit`, `after`,
 * `only_first_photo`) più lo stato dell'ultimo giro; i prodotti scaricati vivono nella tabella
 * `products`, mai dentro `nodes.data` — un catalogo di 250 prodotti dentro la riga del nodo
 * viaggerebbe intero a ogni evento realtime, cioè a ogni trascinamento di quel nodo.
 */
import type { SyncStatus } from './sync-state';

export const PRODUCT_PLATFORMS = ['shopify', 'woocommerce'] as const;

export type ProductPlatform = (typeof PRODUCT_PLATFORMS)[number];

export function isProductPlatform(x: string): x is ProductPlatform {
  return (PRODUCT_PLATFORMS as readonly string[]).includes(x);
}

export type ProductsNode = {
  id: string;
  platform: ProductPlatform;
  url: string;
  limit: number;
  after: string | null;
  onlyFirstPhoto: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  syncedCount: number;
  syncedAt: string | null;
};

const PRODUCTS_NODE_SIZE = { w: 420, h: 360 };
const DEFAULT_LIMIT = 20;

export function productsNodeSize(): { w: number; h: number } {
  return { ...PRODUCTS_NODE_SIZE };
}

export type NewProductsTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  platform: ProductPlatform;
  url: string;
  limit: number;
  after: null;
  onlyFirstPhoto: false;
  connectable: false;
};

/**
 * `connectable: false` — un catalogo scaricato è una SORGENTE come `media`/`document`/`memory` in
 * `graph.ts`: niente lo genera, quindi un arco in ENTRATA non farebbe niente. Un arco in USCITA
 * (un prodotto che alimenta un post) è un lavoro successivo, non deciso da questo file.
 */
export function newProductsNodeAt(at: { x: number; y: number }): NewProductsTile {
  const { w, h } = productsNodeSize();

  return {
    id: crypto.randomUUID(),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    platform: 'shopify',
    url: '',
    limit: DEFAULT_LIMIT,
    after: null,
    onlyFirstPhoto: false,
    connectable: false
  };
}
