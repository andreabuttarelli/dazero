/**
 * IMPORTA I 54 TALENT DI ANOMALIA NEL CATALOGO GLOBALE `influencers` (`org_id = null`).
 *
 * Legge dal progetto Supabase VECCHIO (`OLD_DAZERO_*`), scrive nel progetto NUOVO con la
 * service-role key (`SUPABASE_SERVICE_ROLE_KEY`) — la RLS di scrittura su `influencers` richiede
 * `org_id is not null` per costruzione, e un catalogo globale non ce l'ha: solo la service role
 * può scriverlo (vedi `service-role-uses.ts`).
 *
 * IDEMPOTENTE: `influencers_org_slug_key` è `unique(coalesce(org_id, zero-uuid), slug)`, quindi
 * un secondo giro con lo stesso slug fa un update, non un duplicato — `slug` qui è lo `slug`
 * dell'anomalia originale, non uno nuovo a ogni corsa (a differenza del builder, dove uno slug
 * nuovo a ogni creazione è corretto: un giro qui rappresenta LO STESSO talent, sempre).
 *
 * NON SCRIVE FINCHÉ LA MIGRATION NON È APPLICATA — `influencers`/`influencer_views` non esistono
 * ancora sul database nuovo (`supabase/canvas-migrations/20260922_influencers.sql`, pending). Uno
 * `--dry-run` stampa cosa farebbe senza toccare niente; senza quel flag, un tavolo mancante fa
 * fallire con l'errore di Postgres (42P01), non in silenzio.
 *
 *   node --env-file=.env node_modules/.bin/vite-node --config scripts/vite-node.config.ts \
 *     scripts/import-anomalia-talents.ts -- --dry-run
 *   node --env-file=.env node_modules/.bin/vite-node --config scripts/vite-node.config.ts \
 *     scripts/import-anomalia-talents.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleDb } from '$lib/server/db/client';

const IMPORT_ANOMALIA_TALENTS_USE = {
  path: 'scripts/import-anomalia-talents.ts',
  why: "Uno script una tantum, senza sessione utente: scrive il catalogo globale (`influencers.org_id = null`), che la RLS vieta a qualunque JWT per costruzione — le policy di scrittura richiedono `org_id is not null`. Legge anche dal progetto Supabase VECCHIO (`OLD_DAZERO_*`), un database diverso su cui questa distinzione non si applica.",
  tables: ['influencers', 'influencer_views'] as const
};

const OLD_TALENT_BUCKET = 'talent';
const NEW_INFLUENCER_BUCKET = 'influencers';
const MAX_VIEW_BYTES = 8 * 1024 * 1024;

export type OldTalentRow = {
  id: string;
  slug: string;
  name: string;
  gender: string | null;
  age: number | null;
  body_type: string | null;
  ethnicity: string | null;
  summary: string | null;
  traits: Record<string, unknown> | null;
  status: string;
  height_band: string | null;
};

export type OldTalentViewRow = {
  id: string;
  talent_id: string;
  view_key: string;
  label: string;
  aspect_ratio: string | null;
  path: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  sort_order: number;
};

export type MappedInfluencer = {
  slug: string;
  name: string;
  gender: string | null;
  age: number | null;
  ethnicity: string | null;
  bodyType: string | null;
  heightBand: string | null;
  summary: string | null;
  traits: Record<string, unknown>;
  source: 'catalogue';
  actorKind: 'system';
  actorId: null;
};

export type MappedView = {
  viewKey: string;
  label: string;
  aspectRatio: string | null;
  oldPath: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
};

/**
 * LA MAPPATURA, PURA — testabile senza un database, il criterio di CLAUDE.md per un pezzo di
 * logica che merita un test suo. Ogni talent `status !== 'active'` viene saltato: un talent
 * disattivato in anomalia non deve rinascere nel catalogo nuovo.
 */
export function mapTalent(row: OldTalentRow): MappedInfluencer | null {
  if (row.status !== 'active') return null;

  return {
    slug: row.slug,
    name: row.name,
    gender: row.gender,
    age: row.age,
    ethnicity: row.ethnicity,
    bodyType: row.body_type,
    heightBand: row.height_band,
    summary: row.summary,
    traits: row.traits ?? {},
    source: 'catalogue',
    actorKind: 'system',
    actorId: null
  };
}

export function mapTalentView(row: OldTalentViewRow): MappedView {
  return {
    viewKey: row.view_key,
    label: row.label,
    aspectRatio: row.aspect_ratio,
    oldPath: row.path,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sortOrder: row.sort_order
  };
}

function oldClient(): SupabaseClient {
  const url = process.env.OLD_DAZERO_PUBLIC_SUPABASE_URL;
  const key = process.env.OLD_DAZERO_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('OLD_DAZERO_PUBLIC_SUPABASE_URL / OLD_DAZERO_SUPABASE_SERVICE_ROLE_KEY not set');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const old = oldClient();
  const db = createServiceRoleDb(IMPORT_ANOMALIA_TALENTS_USE);

  const { data: talents, error: talentsError } = await old.from('talents').select('*');
  if (talentsError) {
    throw new Error(`talents: ${talentsError.message}`);
  }

  const { data: views, error: viewsError } = await old.from('talent_views').select('*');
  if (viewsError) {
    throw new Error(`talent_views: ${viewsError.message}`);
  }

  const viewsByTalent = new Map<string, OldTalentViewRow[]>();
  for (const view of (views ?? []) as OldTalentViewRow[]) {
    const list = viewsByTalent.get(view.talent_id) ?? [];
    list.push(view);
    viewsByTalent.set(view.talent_id, list);
  }

  let imported = 0;
  let skipped = 0;
  let viewsImported = 0;

  for (const row of (talents ?? []) as OldTalentRow[]) {
    const mapped = mapTalent(row);
    if (!mapped) {
      skipped += 1;
      console.log(`skip ${row.slug} (status=${row.status})`);
      continue;
    }

    const talentViews = (viewsByTalent.get(row.id) ?? []).map(mapTalentView).sort((a, b) => a.sortOrder - b.sortOrder);

    if (dryRun) {
      console.log(`[dry-run] ${mapped.slug}: ${mapped.name}, ${talentViews.length} views`);
      imported += 1;
      continue;
    }

    // `influencers_org_slug_key` è un indice su ESPRESSIONE (`coalesce(org_id, zero-uuid)`),
    // che PostgREST non può targettare con `onConflict: 'org_id,slug'` — quella sintassi vale
    // solo per un vincolo su colonne semplici. Qui `org_id` è sempre null per costruzione (il
    // catalogo), quindi si cerca la riga a mano e si aggiorna o si crea, invece di un upsert che
    // il database rifiuterebbe con "there is no unique or exclusion constraint matching".
    const { data: existing } = await db
      .from('influencers')
      .select('id')
      .is('org_id', null)
      .eq('slug', mapped.slug)
      .maybeSingle();

    const influencerFields = {
      org_id: null,
      name: mapped.name,
      slug: mapped.slug,
      gender: mapped.gender,
      age: mapped.age,
      ethnicity: mapped.ethnicity,
      body_type: mapped.bodyType,
      height_band: mapped.heightBand,
      summary: mapped.summary,
      traits: mapped.traits,
      source: mapped.source,
      actor_kind: mapped.actorKind,
      actor_id: mapped.actorId
    };

    const { data: influencer, error: upsertError } = existing
      ? await db.from('influencers').update(influencerFields).eq('id', existing.id).select('id').single()
      : await db.from('influencers').insert(influencerFields).select('id').single();

    if (upsertError || !influencer) {
      console.error(`${mapped.slug}: influencer upsert failed — ${upsertError?.message}`);
      continue;
    }

    for (const view of talentViews) {
      const { data: signed, error: signError } = await old.storage
        .from(OLD_TALENT_BUCKET)
        .createSignedUrl(view.oldPath, 300);
      if (signError || !signed) {
        console.error(`  ${view.viewKey}: sign failed — ${signError?.message}`);
        continue;
      }

      const res = await fetch(signed.signedUrl);
      if (!res.ok) {
        console.error(`  ${view.viewKey}: fetch failed — ${res.status}`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_VIEW_BYTES) {
        console.error(`  ${view.viewKey}: too large (${bytes.length} bytes)`);
        continue;
      }

      const newPath = `catalogue/${influencer.id}/${view.viewKey}.${(view.mimeType ?? 'image/webp').split('/')[1]}`;
      const { error: uploadError } = await db.storage
        .from(NEW_INFLUENCER_BUCKET)
        .upload(newPath, bytes, { contentType: view.mimeType ?? 'image/webp', upsert: true });
      if (uploadError) {
        console.error(`  ${view.viewKey}: upload failed — ${uploadError.message}`);
        continue;
      }

      const { error: viewInsertError } = await db.from('influencer_views').upsert(
        {
          org_id: null,
          influencer_id: influencer.id,
          view_key: view.viewKey,
          label: view.label,
          storage_path: newPath,
          mime_type: view.mimeType,
          width: view.width,
          height: view.height,
          sort_order: view.sortOrder
        },
        { onConflict: 'influencer_id,view_key' }
      );
      if (viewInsertError) {
        console.error(`  ${view.viewKey}: row insert failed — ${viewInsertError.message}`);
        continue;
      }

      viewsImported += 1;
    }

    imported += 1;
    console.log(`${dryRun ? '[dry-run] ' : ''}${mapped.slug}: ${talentViews.length} views`);
  }

  console.log(`\n${imported} influencers imported, ${skipped} skipped, ${viewsImported} views stored.`);
}

export function isScriptEntry(env: Record<string, string | undefined>): boolean {
  return !env.VITEST;
}

if (isScriptEntry(process.env)) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
