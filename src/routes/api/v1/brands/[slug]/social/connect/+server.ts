import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticate, checkApiKeyWriteAccess, loadBrandForUser } from '$lib/server/cli-auth';
import { appOrigin } from '$lib/server/app-url';
import { connectPath, managePath, socialConnections } from '$lib/server/social-connections';
import { projectIdOfBrand } from '$lib/server/tenancy/brand-slug';
import { SOCIAL_CONNECT_LINK, TARGET_PLATFORMS, statusForFailure } from '@feega/api-contracts';

/**
 * Conia la porta, non la attraversa.
 *
 * L'URL è la nostra pagina `/settings/connect/:platform`, che chiede la login della persona e da
 * lì manda all'OAuth della piattaforma. È deliberatamente quella e non l'URL OAuth di Zernio:
 * quello va coniato creando il profilo Zernio del brand, scade, si usa una volta sola, e porta un
 * token nell'indirizzo — tre buoni motivi perché non passi mai da un agente. Così invece il
 * consenso lo dà una persona già dentro, e qui non transita nessun segreto.
 *
 * Niente più piani: il rifiuto è uno solo, `insufficient_credits` — il saldo dell'org non copre il
 * canone di un account in più. Riautorizzare una piattaforma già collegata non lo attraversa mai:
 * il posto è già suo, e rifiutarlo lascerebbe un account scaduto senza modo di tornare vivo.
 */
export const POST: RequestHandler = async ({ request, params, url }) => {
  const { supabase, error, apiKey } = await authenticate(request);
  if (error) return error;

  const { brand, error: brandError } = await loadBrandForUser(supabase, params.slug, apiKey);
  if (brandError) return brandError;

  const readOnly = checkApiKeyWriteAccess(apiKey);
  if (readOnly) return readOnly;

  const parsed = SOCIAL_CONNECT_LINK.input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(
      {
        error: 'invalid_input',
        details: parsed.error.issues,
        platform_choices: [...TARGET_PLATFORMS]
      },
      { status: 400 }
    );
  }

  const { platform } = parsed.data;
  const origin = appOrigin(url);
  const projectId = await projectIdOfBrand(supabase, brand.id);
  if (!projectId) {
    return json({ error: 'no_project' }, { status: 409 });
  }
  const manageUrl = `${origin}${managePath(projectId)}`;
  const state = await socialConnections(supabase, brand);
  const alreadyConnected = state.connected.includes(platform);

  if (!alreadyConnected && !state.canConnect) {
    return json(
      { error: 'insufficient_credits', slots: state.slots, manage_url: manageUrl },
      { status: statusForFailure(SOCIAL_CONNECT_LINK, 'insufficient_credits') }
    );
  }

  return json({
    ok: true,
    platform,
    url: `${origin}${connectPath(projectId, platform)}`,
    already_connected: alreadyConnected,
    slots: state.slots,
    manage_url: manageUrl
  });
};
