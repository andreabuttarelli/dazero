import type { Db } from '$lib/server/db/client';
import type { NarrowedDatabase } from '$lib/server/db/typed-database';
import { productsOf, socialFeedOf } from '$lib/canvas-node-data';
import { isProductPlatform } from '$lib/canvas/products-node';
import { isSocialFeedPlatform } from '$lib/canvas/social-feed-node';
import { syncProductsNode } from './products-sync';
import { syncSocialFeedNode } from './social-feed-sync';

type NodeUpdate = NarrowedDatabase['public']['Tables']['nodes']['Update'];

/**
 * IL RINFRESCO AUTOMATICO DI `products` E `social_account_feed`, sullo stesso cron che già gira
 * ogni minuto (`api/v1/canvas/runs/tick`). Non un cron nuovo — il progetto ne ha già troppi, e la
 * regola è estendere quello che c'è (vercel.json, un solo path per questa tela).
 *
 * MANUALE E AUTOMATICO INSIEME: il bottone "sincronizza" sul nodo (azione `sync` in
 * `+page.server.ts`) chiama la stessa `syncProductsNode`/`syncSocialFeedNode`; questo file
 * decide SOLO quando farlo da solo, senza che nessuno l'abbia chiesto — un catalogo aperto e
 * dimenticato sulla tela resterebbe vecchio di settimane senza questo giro.
 *
 * LA SOGLIA È SULLA RIGA DEL NODO (`data.synced_at`), non su una tabella a parte: `nodes.data`
 * porta già lo stato dell'ultimo giro (`syncStatus`, `syncedAt`) per il bottone manuale, e
 * interrogare due volte la stessa informazione — una per la UI, una per il cron — è la stessa
 * verità scritta in due posti che diverge al primo cambio.
 */
export const SOURCE_SYNC_STALE_MS = 6 * 60 * 60_000;

/** Quanti nodi scaduti un giro di tick lavora al massimo: un tick al minuto smaltisce una coda grande senza un giro che dura un'ora. */
const BATCH_LIMIT = 20;

export type SourceSyncTickOutcome = { checked: number; synced: number; failed: number };

type DueNodeRow = { id: string; org_id: string; project_id: string; type: string; data: Record<string, unknown> };

function isStale(syncedAt: string | null, now: number): boolean {
  if (!syncedAt) {
    return true;
  }
  const at = Date.parse(syncedAt);
  return !Number.isFinite(at) || now - at >= SOURCE_SYNC_STALE_MS;
}

async function dueSourceNodes(db: Db, input: { now: number }): Promise<DueNodeRow[]> {
  const { data, error } = await db
    .from('nodes')
    .select('id, org_id, project_id, type, data')
    .in('type', ['products', 'social_account_feed'])
    .is('deleted_at', null)
    .limit(200);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DueNodeRow[];
  return rows
    .filter((row) => row.data.sync_status !== 'running')
    .filter((row) => isStale(typeof row.data.synced_at === 'string' ? row.data.synced_at : null, input.now))
    .slice(0, BATCH_LIMIT);
}

async function writeSyncResult(
  db: Db,
  row: DueNodeRow,
  outcome: { ok: true; synced: number; extra?: Record<string, unknown> } | { ok: false; error: string }
): Promise<void> {
  const patch = outcome.ok
    ? { sync_status: 'done', sync_error: null, synced_count: outcome.synced, synced_at: new Date().toISOString(), ...outcome.extra }
    : { sync_status: 'failed', sync_error: outcome.error };

  /**
   * `data` arriva qui SLEGATA da `type`, come in `repos/canvas.ts::writeNodeData`: questa
   * funzione non promette che la patch sia la forma esatta che `node-data.ts` accetterebbe per
   * QUESTO `row.type` — lo sa già, l'ha appena letto con `productsOf`/`socialFeedOf` prima di
   * chiamarla. Il cast dichiara l'onestà del confine, non una garanzia che non c'è.
   */
  const update: NodeUpdate = { data: { ...row.data, ...patch }, updated_at: new Date().toISOString() } as NodeUpdate;

  const { error } = await db.from('nodes').update(update).eq('id', row.id).eq('org_id', row.org_id);

  if (error) {
    throw error;
  }
}

async function tickProducts(db: Db, row: DueNodeRow): Promise<boolean> {
  const parsed = productsOf({ id: row.id, type: 'products', data: row.data });
  if (!parsed || !isProductPlatform(parsed.platform) || !parsed.url.trim()) {
    await writeSyncResult(db, row, { ok: false, error: 'invalid_url: this node has no store URL to sync' });
    return false;
  }

  const outcome = await syncProductsNode(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    nodeId: row.id,
    platform: parsed.platform,
    storeUrl: parsed.url,
    limit: parsed.limit,
    after: parsed.after,
    onlyFirstPhoto: parsed.onlyFirstPhoto
  });

  await writeSyncResult(
    db,
    row,
    outcome.ok ? { ok: true, synced: outcome.synced, extra: { after: outcome.after } } : outcome
  );
  return outcome.ok;
}

async function tickSocialFeed(db: Db, row: DueNodeRow): Promise<boolean> {
  const parsed = socialFeedOf({ id: row.id, type: 'social_account_feed', data: row.data });
  if (!parsed || !isSocialFeedPlatform(parsed.platform) || !parsed.handle.trim()) {
    await writeSyncResult(db, row, { ok: false, error: 'missing_handle: this node has no handle to sync' });
    return false;
  }

  const outcome = await syncSocialFeedNode(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    nodeId: row.id,
    platform: parsed.platform,
    handle: parsed.handle,
    limit: parsed.limit
  });

  await writeSyncResult(db, row, outcome);
  return outcome.ok;
}

export async function tickSourceSync(db: Db): Promise<SourceSyncTickOutcome> {
  const due = await dueSourceNodes(db, { now: Date.now() });

  let synced = 0;
  let failed = 0;
  for (const row of due) {
    const ok = row.type === 'products' ? await tickProducts(db, row) : await tickSocialFeed(db, row);
    if (ok) synced += 1;
    else failed += 1;
  }

  return { checked: due.length, synced, failed };
}
