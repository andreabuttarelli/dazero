import type { Db } from '$lib/server/db/client';
import type { CanvasNodeRecord } from '$lib/server/repos/canvas';
import type { PostMedia, Post } from '$lib/server/repos/posts';
import type { ActorKind } from '$lib/server/repos/posts';
import { uploadedNodeOf } from '$lib/canvas/uploaded-node';

/**
 * DAI NODI DELLA TELA A UN POST — la promozione (NEW_DATABASE_STRUCTURE.md: "canvas → post").
 * Ogni nodo passato diventa una sorgente (`post_sources`), e i nodi che portano un asset (image,
 * video, doc/text caricati o generati) entrano in `posts.media` nell'ordine di lettura della tela:
 * alto→basso, poi sinistra→destra — lo stesso ordine in cui un occhio la percorre.
 *
 * UN ASSET SI RISOLVE IN DUE MODI, MAI UN TERZO: `data.assetId` per un nodo caricato
 * (`uploaded-node.ts`), `data.output_asset_id` per un nodo generato — e solo quando
 * `data.status === 'done'`: una generazione ancora in corso non ha un file da promuovere, e
 * promuoverne uno a metà (o nessuno silenziosamente) sarebbe un post con un buco che nessuno nota
 * finché non prova a pubblicarlo.
 */

type CanvasRepo = {
  listNodesByIds: (db: Db, scope: { orgId: string; nodeIds: string[] }) => Promise<CanvasNodeRecord[]>;
};

type PostsRepo = {
  promoteToPost: (
    db: Db,
    input: {
      orgId: string;
      brandId: string;
      caption: string;
      media: PostMedia[];
      actorKind?: ActorKind;
      actorId?: string | null;
      sources?: { nodeId: string; role?: string }[];
    }
  ) => Promise<Post>;
};

function readingOrder(a: CanvasNodeRecord, b: CanvasNodeRecord): number {
  return a.position.y - b.position.y || a.position.x - b.position.x;
}

function assetIdOf(node: CanvasNodeRecord): string | null {
  const uploaded = uploadedNodeOf({ id: node.id, data: node.data });
  if (uploaded) return uploaded.assetId;

  if (node.data.status === 'done' && typeof node.data.output_asset_id === 'string') {
    return node.data.output_asset_id;
  }
  return null;
}

function captionOf(node: CanvasNodeRecord): string | null {
  if (node.type === 'doc' && typeof node.data.content === 'string') return node.data.content;
  if (node.type === 'text' && node.data.status === 'done' && typeof node.data.output_asset_id === 'string') {
    return typeof node.data.prompt === 'string' ? node.data.prompt : null;
  }
  return null;
}

export async function promoteNodesToPost(
  db: Db,
  repos: { canvas: CanvasRepo; posts: PostsRepo },
  input: {
    orgId: string;
    brandId: string;
    nodeIds: string[];
    caption?: string;
    actorKind?: ActorKind;
    actorId?: string | null;
  }
): Promise<Post> {
  const nodes = await repos.canvas.listNodesByIds(db, { orgId: input.orgId, nodeIds: input.nodeIds });

  const foundIds = new Set(nodes.map((n) => n.id));
  const missing = input.nodeIds.filter((id) => !foundIds.has(id));
  if (missing.length) {
    throw new Error(`node_not_found: ${missing.join(', ')}`);
  }

  const ordered = [...nodes].sort(readingOrder);

  const media: PostMedia[] = [];
  const sources: { nodeId: string; role: string }[] = [];
  const captionParts: string[] = [];

  for (const node of ordered) {
    const caption = captionOf(node);
    if (caption !== null) {
      // Un `caption` esplicito arriva già scelto da chi chiama (il composer): i nodi restano
      // sorgenti — `post_sources` non deve dimenticare da dove il post nasce — ma non concatenano
      // più il proprio testo, che sarebbe una seconda caption che nessuno ha scelto.
      if (input.caption === undefined) {
        captionParts.push(caption);
      }
      sources.push({ nodeId: node.id, role: 'caption' });
      continue;
    }

    const assetId = assetIdOf(node);
    if (assetId) {
      media.push({ assetId, order: media.length, role: 'media' });
      sources.push({ nodeId: node.id, role: 'media' });
      continue;
    }

    sources.push({ nodeId: node.id, role: 'reference' });
  }

  return repos.posts.promoteToPost(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    caption: input.caption ?? captionParts.join('\n\n'),
    media,
    actorKind: input.actorKind,
    actorId: input.actorId,
    sources
  });
}
