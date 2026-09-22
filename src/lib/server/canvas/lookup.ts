import type { Db } from '$lib/server/db/client';
import type { Canvas } from '$lib/server/repos/canvas';
import type { Membership } from '$lib/server/repos/orgs';

/**
 * DA UN ID NELL'URL A UNA TELA CHE È DAVVERO SUA.
 *
 * `/p/<projectId>/c/<id>` porta solo la tela: l'org non sta nel percorso, perché sarebbe una cosa in più da
 * tenere allineata a ogni link. Quindi va ritrovata, e il modo in cui la si ritrova è la
 * differenza fra una pagina e una fuga: si cerca DENTRO le appartenenze, una per una, con
 * `org_id` nella query — mai per solo `id` fidandosi della RLS, che il codice service-role
 * scavalca senza dirlo.
 *
 * Una per una e non in un `in`: le org di una persona sono una o due, la prima risponde quasi
 * sempre, e un giro in più costa meno di una query che il doppio del client non sa riprodurre.
 */
export type OpenCanvas = { orgId: string; canvas: Canvas };

const CANVAS_COLUMNS = 'id, project_id, name, viewport';

export async function findCanvasForUser(
  db: Db,
  input: { canvasId: string; memberships: Membership[] }
): Promise<OpenCanvas | null> {
  for (const { org } of input.memberships) {
    const { data, error } = await db
      .from('canvases')
      .select(CANVAS_COLUMNS)
      .eq('id', input.canvasId)
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
      canvas: {
        id: data.id,
        projectId: data.project_id,
        name: data.name,
        viewport: (data.viewport as Canvas['viewport']) ?? null
      }
    };
  }

  return null;
}
