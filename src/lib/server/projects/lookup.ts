import type { Db } from '$lib/server/db/client';
import type { Project } from '$lib/server/repos/projects';
import type { Membership } from '$lib/server/repos/orgs';

/**
 * DA UN ID NELL'URL A UN PROGETTO CHE È DAVVERO SUO.
 *
 * `/p/<id>` porta solo il progetto: l'org non sta nel percorso. Si ritrova cercando DENTRO le
 * appartenenze, una per una, con `org_id` nella query — mai per solo `id` fidandosi della RLS,
 * che il codice service-role scavalca senza dirlo.
 */
export type OpenProject = { orgId: string; project: Project };

const PROJECT_COLUMNS = 'id, name, slug, brand_id, archived_at';

export async function findProjectForUser(
  db: Db,
  input: { projectId: string; memberships: Membership[] }
): Promise<OpenProject | null> {
  for (const { org } of input.memberships) {
    const { data, error } = await db
      .from('projects')
      .select(PROJECT_COLUMNS)
      .eq('id', input.projectId)
      .eq('org_id', org.id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      continue;
    }

    return {
      orgId: org.id,
      project: {
        id: data.id,
        name: data.name,
        slug: data.slug,
        brandId: data.brand_id,
        archivedAt: data.archived_at
      }
    };
  }

  return null;
}
