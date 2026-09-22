import { json } from '@sveltejs/kit';
import { streamText, type ModelMessage } from 'ai';
import type { Db } from '$lib/server/db/client';
import { llmLanguageModel, llmModelForPicker } from '$lib/server/llm';
import { extractSdkUsage, logAiCall, withBrandContext, withOrgContext } from '$lib/server/ai-log';
import { gateAiAction, gateOrgAiAction } from '$lib/server/cli-auth';
import { listMemberships } from '$lib/server/repos/orgs';
import { listCanvases } from '$lib/server/repos/canvas';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { openThread, loadTurns, saveTurn } from '$lib/server/repos/chat';
import { agentActor, SIDEBAR_AGENT_KEY } from '$lib/server/repos/actor';
import { createProjectTools } from '$lib/server/project-agent/project-tools';
import { openAgentTools } from '$lib/server/project-agent/tool-surface';
import { projectAgentPrompt } from '$lib/server/project-agent/system-prompt';
import { AGENT_MAX_DURATION_S, agentStopWhen } from '$lib/server/project-agent/limits';
import type { RequestHandler } from './$types';

/**
 * LA CHAT DI PROGETTO: agnostica al brand.
 *
 * Il progetto è il contenitore; il brand è una PROPRIETÀ nullable. Con zero brand il turno parte
 * lo stesso — i tool di tela ci sono, quelli di brand no. Con un brand attaccato la superficie
 * cresce e il prompt lo dice.
 *
 * Contratto stabile per la sidebar:
 *   POST { message }  →  stream UI messages (stessa forma della vecchia chat di brand)
 *   GET               →  { threadId, messages: [{ role, content }] }
 */
export const config = { maxDuration: AGENT_MAX_DURATION_S };

type BriefBrand = { id: string; name: string; slug: string };

async function loadBriefBrand(
  db: Db,
  input: { orgId: string; brandId: string }
): Promise<BriefBrand | null> {
  const { data } = await db
    .from('brands')
    .select('id, name, slug')
    .eq('id', input.brandId)
    .eq('org_id', input.orgId)
    .maybeSingle();
  return (data as BriefBrand | null) ?? null;
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session?.access_token || !user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }

  const db = await locals.db();
  if (!db) {
    return json({ error: 'no_client' }, { status: 500 });
  }

  const memberships = await listMemberships(db, user.id);
  const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
  if (!found) {
    return json({ error: 'project_not_found' }, { status: 404 });
  }

  const { orgId, project } = found;
  const brand = project.brandId ? await loadBriefBrand(db, { orgId, brandId: project.brandId }) : null;

  const gated = brand ? await gateAiAction(brand, undefined) : await gateOrgAiAction(orgId, undefined);
  if (gated) return gated;

  const { message } = (await request.json()) as { message?: string };
  const text = message?.trim();
  if (!text) return json({ error: 'empty_message' }, { status: 400 });

  const canvases = await listCanvases(db, { orgId, projectId: project.id });
  const threadId = await openThread(db, {
    orgId,
    projectId: project.id,
    userId: user.id,
    brandId: brand?.id ?? null
  });
  const history = await loadTurns(db, { orgId, threadId });

  const actor = agentActor(user.id, SIDEBAR_AGENT_KEY);
  const userActor = { kind: 'user' as const, id: user.id };
  await saveTurn(db, { orgId, threadId, role: 'user', content: text, actor: userActor });

  const projectTools = createProjectTools({
    db,
    orgId,
    projectId: project.id,
    userId: user.id,
    brandId: brand?.id ?? null
  });
  const agent = await openAgentTools({
    projectTools,
    brand,
    accessToken: session.access_token
  });

  const model = llmModelForPicker(null);
  const t0 = Date.now();

  const result = streamText({
    model: llmLanguageModel(model),
    system: projectAgentPrompt({
      project: { id: project.id, name: project.name },
      canvases: canvases.map((c) => ({ id: c.id, name: c.name })),
      brand: brand ? { name: brand.name, slug: brand.slug } : null
    }),
    allowSystemInMessages: true,
    messages: [...history, { role: 'user', content: text }] as ModelMessage[],
    tools: agent.tools,
    stopWhen: [agentStopWhen(t0)],
    onFinish: async ({ text: answer, totalUsage }) => {
      // Chiusura e salvataggio QUI: `streamText` torna subito e dopo il return i tool sarebbero a metà.
      await agent.close().catch(() => {});

      await saveTurn(db, { orgId, threadId, role: 'assistant', content: answer, actor }).catch((e) =>
        console.warn('[project-agent] turn not saved:', e)
      );

      const log = () =>
        logAiCall({
          label: 'project-agent',
          provider: 'llm',
          model,
          ms: Date.now() - t0,
          ok: true,
          brandId: brand?.id,
          orgId,
          userId: user.id,
          threadId,
          projectId: project.id,
          actorKind: 'agent',
          actorId: user.id,
          agentKey: SIDEBAR_AGENT_KEY,
          ...extractSdkUsage(totalUsage)
        });

      if (brand) {
        withBrandContext(brand.id, log);
      } else {
        withOrgContext(orgId, log);
      }
    }
  });

  return result.toUIMessageStreamResponse({ sendReasoning: false });
};

export const GET: RequestHandler = async ({ params, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = await locals.db();
  if (!db) {
    return json({ error: 'no_client' }, { status: 500 });
  }

  const memberships = await listMemberships(db, user.id);
  const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
  if (!found) {
    return json({ error: 'project_not_found' }, { status: 404 });
  }

  const { orgId, project } = found;
  const threadId = await openThread(db, {
    orgId,
    projectId: project.id,
    userId: user.id,
    brandId: project.brandId
  });

  return json({ threadId, messages: await loadTurns(db, { orgId, threadId }) });
};
