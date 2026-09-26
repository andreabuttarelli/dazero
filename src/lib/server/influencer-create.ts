import type { SupabaseClient } from '@supabase/supabase-js';
import { safeFetchBytes, ARCHIVE_USER_AGENT } from '$lib/server/tool-guard';
import { generateImagesWithoutBrand } from '$lib/server/media-generate';
import { createInfluencer, insertInfluencerViews, type CreateInfluencerInput } from '$lib/server/repos/influencers';
import { FACE_FRONT_VIEW, INFLUENCER_VIEWS } from '$lib/canvas/influencer-views';

const INFLUENCER_BUCKET = 'influencers';
const MAX_VIEW_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

async function archiveIntoInfluencerBucket(
  db: SupabaseClient,
  path: string,
  url: string
): Promise<{ path: string; mime: string; bytes: number } | null> {
  try {
    const res = await safeFetchBytes(url, {
      maxBytes: MAX_VIEW_BYTES,
      timeoutMs: FETCH_TIMEOUT_MS,
      userAgent: ARCHIVE_USER_AGENT
    });
    if (!res.ok || !res.mime.startsWith('image/') || !res.bytes.length) return null;

    const { error } = await db.storage.from(INFLUENCER_BUCKET).upload(path, res.bytes, {
      contentType: res.mime,
      upsert: true
    });
    if (error) return null;
    return { path, mime: res.mime, bytes: res.bytes.length };
  } catch {
    return null;
  }
}

export type GenerateInfluencerInput = {
  orgId: string;
  userId: string;
  name: string;
  slug: string;
  gender: string | null;
  age: number | null;
  ethnicity: string | null;
  bodyType: string | null;
  heightBand: string | null;
  summary: string | null;
  facePrompt: string;
  builder: Record<string, unknown> | null;
  templateOf?: string | null;
};

export type GenerateInfluencerResult =
  | { ok: true; influencerId: string }
  | { ok: false; error: string };

/**
 * IL VOLTO PRIMA, LE ALTRE VISTE DOPO — la stessa sequenza di `people.ts` nel prodotto vecchio
 * (un ritratto base, poi N pose con quel ritratto come riferimento), qui applicata alle 7 viste
 * di `INFLUENCER_VIEWS`. Ogni chiamata passa dallo stesso `generateImagesWithoutBrand` che i nodi
 * immagine della tela usano — non un percorso di generazione secondo, uno duplicato.
 *
 * UNA VISTA CHE FALLISCE NON FERMA LE ALTRE: un influencer con 5 viste su 7 è comunque utilizzabile
 * — meglio di zero. Solo il volto frontale è bloccante: senza quello non c'è un riferimento da cui
 * far partire le altre, e l'influencer non nasce.
 */
export async function generateInfluencer(
  db: SupabaseClient,
  input: GenerateInfluencerInput
): Promise<GenerateInfluencerResult> {
  const faceJob = await generateImagesWithoutBrand(db as never, {
    orgId: input.orgId,
    userId: input.userId,
    prompt: `${input.facePrompt} ${FACE_FRONT_VIEW.promptFragment}`,
    count: 1,
    aspectRatio: FACE_FRONT_VIEW.aspectRatio as never
  });

  if (!faceJob.ok) {
    const message = 'reason' in faceJob && faceJob.reason ? `${faceJob.error}: ${faceJob.reason}` : faceJob.error;
    return { ok: false, error: message };
  }

  const faceUrl = faceJob.media[0]?.url;
  if (!faceUrl) {
    return { ok: false, error: 'store_failed: no face image returned' };
  }

  const createInput: CreateInfluencerInput = {
    orgId: input.orgId,
    templateOf: input.templateOf ?? null,
    name: input.name,
    slug: input.slug,
    gender: input.gender,
    age: input.age,
    ethnicity: input.ethnicity,
    bodyType: input.bodyType,
    heightBand: input.heightBand,
    summary: input.summary,
    source: 'generated',
    builder: input.builder,
    actorKind: 'user',
    actorId: input.userId
  };
  const influencer = await createInfluencer(db as never, createInput);

  const restJobs = await Promise.all(
    INFLUENCER_VIEWS.slice(1).map(async (view) => {
      const job = await generateImagesWithoutBrand(db as never, {
        orgId: input.orgId,
        userId: input.userId,
        prompt: `${input.facePrompt} ${view.promptFragment} Same person as the reference image.`,
        count: 1,
        aspectRatio: view.aspectRatio as never,
        baseMediaId: faceJob.media[0]?.id ?? undefined
      });
      return { view, job };
    })
  );

  const allJobs = [{ view: FACE_FRONT_VIEW, job: faceJob }, ...restJobs];

  const archived = await Promise.all(
    allJobs.map(async ({ view, job }) => {
      if (!job.ok) return null;
      const url = job.media[0]?.url;
      if (!url) return null;

      const ext = job.media[0]?.mime?.split('/')[1] ?? 'png';
      const path = `${input.orgId}/${influencer.id}/${view.key}.${ext}`;
      const stored = await archiveIntoInfluencerBucket(db, path, url);
      if (!stored) return null;

      return {
        orgId: input.orgId,
        influencerId: influencer.id,
        viewKey: view.key,
        label: view.label,
        storagePath: stored.path,
        mimeType: stored.mime,
        sortOrder: view.sortOrder
      };
    })
  );

  const rows = archived.filter((r): r is NonNullable<typeof r> => r !== null);
  if (!rows.length) {
    return { ok: false, error: 'store_failed: no view survived archiving' };
  }

  await insertInfluencerViews(db as never, rows);

  return { ok: true, influencerId: influencer.id };
}

export type UploadInfluencerInput = {
  orgId: string;
  userId: string;
  name: string;
  slug: string;
  gender: string | null;
  age: number | null;
  ethnicity: string | null;
  bodyType: string | null;
  heightBand: string | null;
  summary: string | null;
  consent: boolean;
  photos: { viewKey: string; label: string; file: File }[];
};

export type UploadInfluencerResult = { ok: true; influencerId: string } | { ok: false; error: string };

/**
 * FOTO CARICATE, NON GENERATE — il consenso è OBBLIGATORIO qui e da nessuna parte nel percorso
 * IA: la foto di una persona vera richiede il suo permesso, un volto generato no. `consent` viene
 * scritto sulla riga (CLAUDE.md, brief): non una spunta che scompare dopo l'invio del form.
 */
export async function uploadInfluencer(db: SupabaseClient, input: UploadInfluencerInput): Promise<UploadInfluencerResult> {
  if (!input.consent) {
    return { ok: false, error: 'consent_required' };
  }
  if (!input.photos.length) {
    return { ok: false, error: 'no_photos' };
  }

  const createInput: CreateInfluencerInput = {
    orgId: input.orgId,
    name: input.name,
    slug: input.slug,
    gender: input.gender,
    age: input.age,
    ethnicity: input.ethnicity,
    bodyType: input.bodyType,
    heightBand: input.heightBand,
    summary: input.summary,
    source: 'upload',
    consent: true,
    actorKind: 'user',
    actorId: input.userId
  };
  const influencer = await createInfluencer(db as never, createInput);

  const rows = await Promise.all(
    input.photos.map(async (photo, index) => {
      const ext = photo.file.type.split('/')[1] ?? 'jpg';
      const path = `${input.orgId}/${influencer.id}/${photo.viewKey}.${ext}`;
      const { error } = await db.storage.from(INFLUENCER_BUCKET).upload(path, photo.file, {
        contentType: photo.file.type,
        upsert: true
      });
      if (error) return null;

      return {
        orgId: input.orgId,
        influencerId: influencer.id,
        viewKey: photo.viewKey,
        label: photo.label,
        storagePath: path,
        mimeType: photo.file.type,
        sortOrder: (index + 1) * 10
      };
    })
  );

  const stored = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  if (!stored.length) {
    return { ok: false, error: 'store_failed' };
  }

  await insertInfluencerViews(db as never, stored);

  return { ok: true, influencerId: influencer.id };
}
