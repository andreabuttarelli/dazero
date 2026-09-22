import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { listPosts, promoteToPost, type PostStatus } from '$lib/server/repos/posts';
import { agentActor } from '$lib/server/repos/actor';

/**
 * IL POST, NON IL NODO. `posts` è l'artefatto promosso — caption, media, brand — pronto per uscire
 * organico o diventare un `ad_creatives`; un nodo è materiale grezzo sulla tela. Questa rotta e
 * `create_post`/`list_posts` in MCP parlano SOLO di questa tabella: `post_sources` collega un post
 * ai nodi da cui nasce, ma restano due cose, e i nomi dei tool lo dicono senza ambiguità.
 */
export const GET: RequestHandler = async ({ request, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const brandId = url.searchParams.get('brand_id');
  if (!brandId) return json({ error: 'brand_id_required' }, { status: 400 });

  const { db, orgId } = resolved.caller;
  const status = url.searchParams.get('status') as PostStatus | null;
  const posts = await listPosts(db, { orgId, brandId, status: status ?? undefined });

  return json({ posts });
};

export const POST: RequestHandler = async ({ request, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, userId, apiKeyId, writeAllowed } = resolved.caller;
  if (!writeAllowed) return json({ error: 'api_key_read_only' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    brand_id?: string;
    caption?: string;
    media?: { assetId: string; order: number; role?: string }[];
    title?: string;
    link_url?: string;
    sources?: { node_id: string; role?: string }[];
  };

  if (!body.brand_id || !body.caption) {
    return json({ error: 'brand_id_and_caption_required' }, { status: 400 });
  }

  const actor = agentActor(userId, apiKeyId ? `api_key:${apiKeyId}` : 'sidebar');
  const post = await promoteToPost(db, {
    orgId,
    brandId: body.brand_id,
    caption: body.caption,
    media: body.media ?? [],
    title: body.title ?? null,
    linkUrl: body.link_url ?? null,
    actorKind: actor.kind,
    actorId: actor.id,
    sources: body.sources?.map((s) => ({ nodeId: s.node_id, role: s.role }))
  });

  return json({ post });
};
