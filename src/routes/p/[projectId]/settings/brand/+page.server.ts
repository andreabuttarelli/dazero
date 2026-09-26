import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { readUploadImage } from '$lib/server/raster-image';
import { setProjectBrand } from '$lib/server/repos/projects';
import { brandIdOf } from '$lib/server/tenancy/brand-slug';

const BRAND_COLUMNS = 'id, name, slug, logo_url, website, short_description, content';

export type BrandSettings = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  shortDescription: string | null;
  content: string | null;
};

function toBrandSettings(row: {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  short_description: string | null;
  content: string | null;
}): BrandSettings {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    website: row.website,
    shortDescription: row.short_description,
    content: row.content
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'brand'}-${Date.now().toString(36)}`;
}

export const load: PageServerLoad = async ({ parent, locals: { supabase } }) => {
  const { project, org, brand: brandOrNull } = await parent();

  const orgBrands = await supabase
    .from('brands')
    .select(BRAND_COLUMNS)
    .eq('org_id', org.id)
    .order('name', { ascending: true });
  if (orgBrands.error) {
    throw error(500, orgBrands.error.message);
  }

  if (!brandOrNull) {
    return {
      brand: null,
      orgBrands: (orgBrands.data ?? []).map(toBrandSettings)
    };
  }

  const { data, error: dbError } = await supabase
    .from('brands')
    .select(BRAND_COLUMNS)
    .eq('id', brandOrNull.id)
    .maybeSingle();
  if (dbError) {
    throw error(500, dbError.message);
  }
  if (!data) {
    throw error(404, 'brand not found');
  }

  return {
    brand: toBrandSettings(data),
    orgBrands: (orgBrands.data ?? []).map(toBrandSettings)
  };
};

async function orgIdOfProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string
): Promise<string | null> {
  const { data } = await supabase.from('projects').select('org_id').eq('id', projectId).maybeSingle();
  return data?.org_id ?? null;
}

export const actions: Actions = {
  update: async ({ request, params, locals: { supabase } }) => {
    const brandId = await brandIdOf(supabase, params.projectId!);
    if (!brandId) return fail(400, { error: 'No brand selected for this project' });

    const fd = await request.formData();
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required' });

    const website = String(fd.get('website') ?? '').trim();
    const normalizedWebsite = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null;

    const patch = {
      name,
      website: normalizedWebsite,
      short_description: String(fd.get('short_description') ?? '').trim() || null,
      content: String(fd.get('content') ?? '').trim() || null,
      updated_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase.from('brands').update(patch).eq('id', brandId);
    if (updateError) return fail(400, { error: updateError.message });
    return { saved: true };
  },

  uploadLogo: async ({ request, params, locals: { supabase } }) => {
    const brandId = await brandIdOf(supabase, params.projectId!);
    if (!brandId) return fail(400, { error: 'No brand selected for this project' });

    const fd = await request.formData();
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'No file' });

    const img = await readUploadImage(file, { maxOutBytes: 4_000_000 });
    if (!img.ok) {
      return fail(400, {
        error:
          img.error === 'too_large' ? 'Too large' : img.error === 'not_image' ? 'Not an image' : 'Could not convert image'
      });
    }

    const ext = img.mime === 'image/png' ? 'png' : img.mime === 'image/gif' ? 'gif' : img.mime === 'image/webp' ? 'webp' : 'jpg';
    const path = `${brandId}/logo-${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from('media').upload(path, img.bytes, { contentType: img.mime, upsert: false });
    if (up.error) return fail(400, { error: up.error.message });
    const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;

    const { error: updateError } = await supabase
      .from('brands')
      .update({ logo_url: url, updated_at: new Date().toISOString() })
      .eq('id', brandId);
    if (updateError) return fail(400, { error: updateError.message });
    return { saved: true };
  },

  removeLogo: async ({ params, locals: { supabase } }) => {
    const brandId = await brandIdOf(supabase, params.projectId!);
    if (!brandId) return fail(400, { error: 'No brand selected for this project' });

    const { error: updateError } = await supabase
      .from('brands')
      .update({ logo_url: null, updated_at: new Date().toISOString() })
      .eq('id', brandId);
    if (updateError) return fail(400, { error: updateError.message });
    return { saved: true };
  },

  selectBrand: async ({ request, params, locals: { supabase } }) => {
    const fd = await request.formData();
    const brandId = String(fd.get('brandId') ?? '').trim();
    if (!brandId) return fail(400, { error: 'Pick a brand' });

    const orgId = await orgIdOfProject(supabase, params.projectId!);
    if (!orgId) return fail(404, { error: 'Project not found' });

    try {
      await setProjectBrand(supabase, { orgId, projectId: params.projectId!, brandId });
    } catch (e) {
      return fail(400, { error: e instanceof Error ? e.message : 'Could not assign the brand' });
    }
    return { saved: true };
  },

  createBrand: async ({ request, params, locals: { supabase } }) => {
    const fd = await request.formData();
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required' });

    const orgId = await orgIdOfProject(supabase, params.projectId!);
    if (!orgId) return fail(404, { error: 'Project not found' });

    const { data: created, error: insertError } = await supabase
      .from('brands')
      .insert({ org_id: orgId, name, slug: slugify(name) })
      .select('id')
      .single();
    if (insertError || !created) {
      return fail(400, { error: insertError?.message ?? 'Could not create the brand' });
    }

    try {
      await setProjectBrand(supabase, { orgId, projectId: params.projectId!, brandId: created.id });
    } catch (e) {
      return fail(400, { error: e instanceof Error ? e.message : 'Could not assign the brand' });
    }
    return { saved: true };
  }
};
