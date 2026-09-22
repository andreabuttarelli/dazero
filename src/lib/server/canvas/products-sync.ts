import type { Db } from '$lib/server/db/client';
import { fetchStoreProductsPage, type StorePlatform } from '$lib/server/store-fetch';
import { upsertNodeProducts } from '$lib/server/repos/products';

/**
 * UN GIRO DI SINCRONIZZAZIONE PER UN NODO `products`.
 *
 * Il nodo non appartiene a un brand — prende un URL di store pubblico e lo scarica, punto (la
 * decisione è del prodotto: "il nodo products deve essere indipendente da qualsiasi brand").
 * Quindi non c'è un catalogo da filtrare e non c'è un rifiuto da scrivere per "questo progetto non
 * ha un brand": ogni nodo scarica la SUA pagina, dallo store che gli è stato detto, e la scrive
 * sotto il proprio `node_id` — due nodi sullo stesso store restano due letture indipendenti, ognuna
 * proprietaria delle sue righe (`products_node_external_idx`).
 *
 * UN ERRORE SI SCRIVE LEGGIBILE, MAI UN TOKEN MUTO: lo standard è `store_failed: Bucket not found`,
 * non un `ok: false` senza perché. `fetchStoreProductsPage` già torna un errore con un prefisso che
 * dice la categoria (`invalid_url`, `store_unreachable`, `store_invalid`, `not_public`, `too_large`,
 * `fetch_failed`) — qui non lo si riscrive, lo si porta fino al nodo.
 */
export type ProductsSyncOutcome =
  | { ok: true; synced: number; after: string | null }
  | { ok: false; error: string };

export async function syncProductsNode(
  db: Db,
  input: {
    orgId: string;
    projectId: string | null;
    nodeId: string;
    platform: StorePlatform;
    storeUrl: string;
    limit: number;
    after: string | null;
    onlyFirstPhoto: boolean;
  }
): Promise<ProductsSyncOutcome> {
  const page = await fetchStoreProductsPage(input.platform, input.storeUrl, {
    limit: input.limit,
    after: input.after,
    onlyFirstPhoto: input.onlyFirstPhoto
  });

  if (!page.ok) {
    return { ok: false, error: page.error };
  }

  const synced = await upsertNodeProducts(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    nodeId: input.nodeId,
    platform: input.platform,
    products: page.products
  });

  return { ok: true, synced, after: page.after };
}
