import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listNodesByIds } from '$lib/server/repos/canvas';
import { listOrgBrands } from '$lib/server/repos/brands';
import { listBrandAccounts, type SocialAccount } from '$lib/server/repos/social-accounts';

export const load: PageServerLoad = async ({ parent, url, locals }) => {
  const nodeIds = url.searchParams.get('nodeIds')?.split(',').filter(Boolean) ?? [];
  const { project, org } = await parent();

  const db = await locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  const [nodeRecords, brands] = await Promise.all([
    listNodesByIds(db, { orgId: org.id, nodeIds }),
    listOrgBrands(db, org.id)
  ]);

  const accountsByBrand: Record<string, SocialAccount[]> = {};
  for (const brand of brands) {
    accountsByBrand[brand.id] = await listBrandAccounts(db, { orgId: org.id, brandId: brand.id });
  }

  const canvasId = nodeRecords[0]?.canvasId ?? null;

  const nodes = nodeRecords.map((node) => ({
    id: node.id,
    type: node.type,
    data: node.data,
    mediaUrl:
      typeof node.data.assetId === 'string' && canvasId
        ? `/p/${project.id}/c/${canvasId}/assets/${node.data.assetId}`
        : null
  }));

  return { nodes, brands, accountsByBrand, projectBrandId: project.brandId, canvasId };
};
