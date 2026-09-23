import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listMemberships } from '$lib/server/repos/orgs';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { listInfluencers, listInfluencerViewsByIds, signInfluencerViewFiles, getInfluencer } from '$lib/server/repos/influencers';
import { generateInfluencer, uploadInfluencer } from '$lib/server/influencer-create';
import { gateOrgAiAction } from '$lib/server/cli-auth';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * LA LIBRERIA INFLUENCER DEL PROGETTO: catalogo globale + propri dell'org, con le due strade di
 * creazione (IA da descrizione, foto caricate) e "usa come modello" per clonare un influencer
 * esistente dentro l'org con le opzioni del builder già pronte da riaprire.
 */
async function scopeFor(event: RequestEvent) {
  const { session, user } = await event.locals.safeGetSession();
  if (!session || !user) {
    throw redirect(303, '/login');
  }

  const db = await event.locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  const memberships = await listMemberships(db, user.id);
  const found = await findProjectForUser(db, { projectId: event.params.projectId ?? '', memberships });
  if (!found) {
    throw error(404, 'questo progetto non esiste, o non è tuo');
  }

  return { db, orgId: found.orgId, project: found.project, userId: user.id };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'influencer'}-${crypto.randomUUID().slice(0, 8)}`;
}

export const load: PageServerLoad = async (event) => {
  const { db, project, orgId } = await scopeFor(event);

  const rows = await listInfluencers(db);
  const viewsByInfluencer = await listInfluencerViewsByIds(db, rows.map((r) => r.id));
  const coverPaths = rows
    .map((r) => viewsByInfluencer.get(r.id)?.[0]?.storagePath)
    .filter((p): p is string => Boolean(p));
  const signed = await signInfluencerViewFiles(db, coverPaths);

  const influencers = rows.map((r) => {
    const cover = viewsByInfluencer.get(r.id)?.[0] ?? null;
    return {
      id: r.id,
      name: r.name,
      source: r.source,
      gender: r.gender,
      age: r.age,
      ethnicity: r.ethnicity,
      bodyType: r.bodyType,
      heightBand: r.heightBand,
      summary: r.summary,
      builder: r.builder,
      templateOf: r.templateOf,
      coverUrl: cover ? (signed.get(cover.storagePath) ?? null) : null,
      canEdit: r.orgId === orgId
    };
  });

  return { project: { id: project.id, name: project.name, slug: project.slug }, influencers };
};

export const actions: Actions = {
  generate: async (event) => {
    const { db, orgId, userId } = await scopeFor(event);
    const fd = await event.request.formData();

    const denied = await gateOrgAiAction(orgId, undefined);
    if (denied) {
      return fail(denied.status, { error: 'credits_exhausted' });
    }

    const name = String(fd.get('name') ?? '').trim();
    const facePrompt = String(fd.get('prompt') ?? '').trim();
    if (!name || !facePrompt) {
      return fail(400, { error: 'name and description are required' });
    }

    let builder: Record<string, unknown> | null = null;
    try {
      const raw = fd.get('builder');
      builder = raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : null;
    } catch {
      builder = null;
    }

    const result = await generateInfluencer(db, {
      orgId,
      userId,
      name,
      slug: slugify(name),
      gender: (fd.get('gender') as string) || null,
      age: fd.get('age') ? Number(fd.get('age')) : null,
      ethnicity: (fd.get('ethnicity') as string) || null,
      bodyType: (fd.get('bodyType') as string) || null,
      heightBand: (fd.get('heightBand') as string) || null,
      summary: (fd.get('summary') as string) || null,
      facePrompt,
      builder,
      templateOf: (fd.get('templateOf') as string) || null
    });

    if (!result.ok) {
      return fail(422, { error: result.error });
    }

    return { ok: true, influencerId: result.influencerId };
  },

  upload: async (event) => {
    const { db, orgId, userId } = await scopeFor(event);
    const fd = await event.request.formData();

    const name = String(fd.get('name') ?? '').trim();
    const consent = fd.get('consent') === 'on' || fd.get('consent') === 'true';
    if (!name) {
      return fail(400, { error: 'name is required' });
    }
    if (!consent) {
      return fail(400, { error: 'consent_required' });
    }

    const photos: { viewKey: string; label: string; file: File }[] = [];
    let index = 0;
    for (const entry of fd.getAll('photo')) {
      if (entry instanceof File && entry.size > 0) {
        photos.push({ viewKey: `upload-${index}`, label: `Photo ${index + 1}`, file: entry });
        index += 1;
      }
    }

    const result = await uploadInfluencer(db, {
      orgId,
      userId,
      name,
      slug: slugify(name),
      gender: (fd.get('gender') as string) || null,
      age: fd.get('age') ? Number(fd.get('age')) : null,
      ethnicity: (fd.get('ethnicity') as string) || null,
      bodyType: (fd.get('bodyType') as string) || null,
      heightBand: (fd.get('heightBand') as string) || null,
      summary: (fd.get('summary') as string) || null,
      consent,
      photos
    });

    if (!result.ok) {
      return fail(422, { error: result.error });
    }

    return { ok: true, influencerId: result.influencerId };
  },

  /**
   * USA COME MODELLO: un influencer di catalogo (o di un'altra org) diventa un punto di partenza
   * per il builder, non un influencer clonato subito — creare la riga tocca a `generate`, quando
   * chi guarda conferma le opzioni. Qui si legge solo l'origine e si torna al client le sue
   * attribute già mappate sui campi del builder.
   */
  template: async (event) => {
    const { db } = await scopeFor(event);
    const fd = await event.request.formData();
    const sourceId = String(fd.get('influencerId') ?? '');

    const source = await getInfluencer(db, sourceId);
    if (!source) {
      return fail(404, { error: 'influencer_not_found' });
    }

    return {
      ok: true,
      template: {
        templateOf: source.id,
        name: `${source.name} (copy)`,
        gender: source.gender,
        age: source.age,
        ethnicity: source.ethnicity,
        bodyType: source.bodyType,
        heightBand: source.heightBand,
        summary: source.summary,
        builder: source.builder
      }
    };
  }
};
