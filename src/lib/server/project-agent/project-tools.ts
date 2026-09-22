import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { Db } from '$lib/server/db/client';
import {
  createConnection,
  createNode,
  deleteNode,
  findNode,
  listCanvases,
  listNodes,
  moveNode,
  writeNodeData
} from '$lib/server/repos/canvas';
import { listProjectAssets } from '$lib/server/repos/assets';
import { runGenNode, runsOf, type RunOutcome } from '$lib/server/canvas/generate';
import { agentActor, type Actor } from '$lib/server/repos/actor';
import { withBrandContext, withOrgContext } from '$lib/server/ai-log';
import { isGenMedium, type GenParams } from '$lib/canvas/gen-node';

/**
 * I TOOL DI PROGETTO E TELA. Sempre presenti, anche senza brand.
 *
 * Ogni tool parla solo ai repository, e i repository portano `org_id` su ogni query: è lì che
 * sta il tenant, non qui. Le descrizioni sono product copy per il modello — dicono il confine
 * (questo progetto, non altri) e non promettono nulla che il tool non fa.
 */
export type ProjectToolDeps = {
  db: Db;
  orgId: string;
  projectId: string;
  userId: string;
  /** Assente = nessun brand: la spesa atterra sull'org. */
  brandId?: string | null;
};

const NODE_NOT_FOUND = { error: 'node_not_found', message: 'No live node with that id in this project.' };
const BAD_MEDIUM = { error: 'bad_medium', message: 'medium must be one of: text, image, video.' };

function outcomeOf(out: RunOutcome): Record<string, unknown> {
  if (out.kind === 'done') {
    return { outcome: 'done', runId: out.run.id, assetId: out.asset.id, assetType: out.asset.type };
  }
  if (out.kind === 'queued') {
    return { outcome: 'queued', runId: out.run.id, externalJobId: out.run.externalJobId };
  }
  if (out.kind === 'conflict') {
    return { outcome: 'conflict', message: 'Node was written by someone else. Re-read it and retry with the new version.' };
  }
  return { outcome: 'refused', error: out.error };
}

export function createProjectTools(deps: ProjectToolDeps): Record<string, Tool> {
  const actor: Actor = agentActor(deps.userId);

  /** La generazione spende: il costo deve atterrare sul brand, o sull'org se non ce n'è uno. */
  const billed = <T>(fn: () => Promise<T>): Promise<T> =>
    deps.brandId ? withBrandContext(deps.brandId, fn) : withOrgContext(deps.orgId, fn);

  return {
    list_canvases: tool({
      description:
        'List the canvases of THIS project. One project only — never other projects, never a brand.',
      inputSchema: z.object({}).strict(),
      execute: async () => {
        const canvases = await listCanvases(deps.db, { orgId: deps.orgId, projectId: deps.projectId });
        return { canvases };
      }
    }),

    list_nodes: tool({
      description:
        'List live nodes on one canvas of THIS project (id, type, position, data, version). Read this before update_node or run_node: the version is required and the data is what you must resend.',
      inputSchema: z.object({ canvasId: z.string().describe('Canvas id from list_canvases.') }).strict(),
      execute: async (input: { canvasId: string }) => {
        const nodes = await listNodes(deps.db, { orgId: deps.orgId, canvasId: input.canvasId });
        return { nodes };
      }
    }),

    create_node: tool({
      description:
        'Create a node on a canvas of THIS project. type is the node kind (text, image, video, …). data is free-form node content, e.g. { prompt, model, params }.',
      inputSchema: z
        .object({
          canvasId: z.string(),
          type: z.string(),
          x: z.number(),
          y: z.number(),
          displayName: z.string().optional(),
          data: z.record(z.string(), z.unknown()).optional()
        })
        .strict(),
      execute: async (input: { canvasId: string; type: string; x: number; y: number; displayName?: string; data?: Record<string, unknown> }) => {
        const node = await createNode(deps.db, {
          orgId: deps.orgId,
          projectId: deps.projectId,
          canvasId: input.canvasId,
          type: input.type,
          x: input.x,
          y: input.y,
          displayName: input.displayName ?? null,
          data: input.data ?? {},
          actor
        });
        return { node };
      }
    }),

    update_node: tool({
      description:
        'Replace a node\'s whole data object on THIS project, versioned. Send every field to keep — this is not a merge. Zero rows written returns { outcome: "conflict" }: re-read the node and retry with its current version. Never reports success on a lost race.',
      inputSchema: z
        .object({
          nodeId: z.string(),
          data: z.record(z.string(), z.unknown()).describe('The full new data object, not a patch.'),
          expectedVersion: z.number().int().describe('The version you read from list_nodes.')
        })
        .strict(),
      execute: async (input: { nodeId: string; data: Record<string, unknown>; expectedVersion: number }) => {
        const written = await writeNodeData(deps.db, {
          orgId: deps.orgId,
          nodeId: input.nodeId,
          data: input.data,
          expectedVersion: input.expectedVersion,
          actor
        });
        if (written.outcome === 'conflict') {
          return { outcome: 'conflict', message: 'Node was written by someone else. Re-read it and retry with the new version.' };
        }
        return { outcome: 'written', node: written.node };
      }
    }),

    move_node: tool({
      description: 'Move a node on its canvas. Position only: last-write-wins, does not touch node data or version.',
      inputSchema: z
        .object({
          nodeId: z.string(),
          x: z.number(),
          y: z.number(),
          z: z.number().optional().describe('Stacking order. Omit to leave it unchanged.')
        })
        .strict(),
      execute: async (input: { nodeId: string; x: number; y: number; z?: number }) => {
        const node = await moveNode(deps.db, { orgId: deps.orgId, ...input, actor });
        if (!node) {
          return NODE_NOT_FOUND;
        }
        return { node };
      }
    }),

    connect_nodes: tool({
      description: 'Connect two nodes on one canvas of THIS project. The edge is directed: source feeds target.',
      inputSchema: z
        .object({
          canvasId: z.string(),
          sourceNodeId: z.string(),
          targetNodeId: z.string(),
          sourceHandle: z.string().optional(),
          targetHandle: z.string().optional()
        })
        .strict(),
      execute: async (input: { canvasId: string; sourceNodeId: string; targetNodeId: string; sourceHandle?: string; targetHandle?: string }) => {
        const connection = await createConnection(deps.db, {
          orgId: deps.orgId,
          canvasId: input.canvasId,
          sourceNodeId: input.sourceNodeId,
          targetNodeId: input.targetNodeId,
          sourceHandle: input.sourceHandle ?? null,
          targetHandle: input.targetHandle ?? null,
          actor
        });
        return { connection };
      }
    }),

    delete_node: tool({
      description: 'Soft-delete a node on THIS project. The node disappears from list_nodes; undo can bring it back.',
      inputSchema: z.object({ nodeId: z.string() }).strict(),
      execute: async (input: { nodeId: string }) => {
        await deleteNode(deps.db, { orgId: deps.orgId, nodeId: input.nodeId, actor });
        return { deleted: true, nodeId: input.nodeId };
      }
    }),

    list_assets: tool({
      description:
        'List assets of THIS project — what its nodes produced and what was uploaded into it. Text lives in `content`; images and video in `url`.',
      inputSchema: z.object({}).strict(),
      execute: async () => {
        const assets = await listProjectAssets(deps.db, { orgId: deps.orgId, projectId: deps.projectId });
        return { assets };
      }
    }),

    run_node: tool({
      description:
        'Generate on a producing node of THIS project (text, image or video). Costs credits: only when the user asked. Versioned like update_node — conflict means re-read and retry. A video may come back queued; poll with list_runs.',
      inputSchema: z
        .object({
          nodeId: z.string(),
          medium: z.enum(['text', 'image', 'video']),
          prompt: z.string().optional().describe('Omit to keep the prompt already on the node.'),
          model: z.string().optional().describe('Omit to keep the model already on the node.'),
          params: z.record(z.string(), z.unknown()).optional().describe('e.g. { aspectRatio: "1:1", duration: 8 }.'),
          expectedVersion: z.number().int()
        })
        .strict(),
      execute: async (input: {
        nodeId: string;
        medium: string;
        prompt?: string;
        model?: string;
        params?: Record<string, unknown>;
        expectedVersion: number;
      }) => {
        const medium = input.medium;
        if (!isGenMedium(medium)) {
          return BAD_MEDIUM;
        }

        const node = await findNode(deps.db, { orgId: deps.orgId, nodeId: input.nodeId });
        if (!node) {
          return NODE_NOT_FOUND;
        }

        const data = node.data as { prompt?: string; model?: string; params?: GenParams };
        const out = await billed(() =>
          runGenNode(deps.db, {
            orgId: deps.orgId,
            projectId: deps.projectId,
            canvasId: node.canvasId,
            nodeId: node.id,
            userId: deps.userId,
            medium,
            prompt: input.prompt ?? data.prompt ?? '',
            model: input.model ?? data.model ?? null,
            params: (input.params ?? data.params ?? {}) as GenParams,
            expectedVersion: input.expectedVersion,
            actor
          })
        );

        return outcomeOf(out);
      }
    }),

    list_runs: tool({
      description: 'Generation history of one node on THIS project, oldest first, with status, cost and the produced text when there is one.',
      inputSchema: z.object({ nodeId: z.string() }).strict(),
      execute: async (input: { nodeId: string }) => {
        const runs = await runsOf(deps.db, { orgId: deps.orgId, nodeId: input.nodeId });
        return { runs };
      }
    })
  };
}
